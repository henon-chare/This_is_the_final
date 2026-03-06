# monitor.py
import asyncio
import time
from typing import List, Dict
import httpx
import socket
from urllib.parse import urlparse

# ADDED IMPORT FOR ALERTS
from alert import check_service_alerts

class SmartDetector:
    """
    Uses Exponentially Weighted Moving Average (EWMA) for adaptive anomaly detection.
    """
    def __init__(self, alpha=0.2, threshold=2.5):
        self.alpha = alpha  # Smoothing factor
        self.threshold = threshold # Standard deviations
        self.ema = 0.0  
        self.emsd = 1.0  # Exponential Moving Standard Deviation
        self.is_initialized = False
        self.consecutive_anomalies = 0
        self.required_failures = 3  # Need 3 bad pings in a row

    def update(self, new_value):
        if not self.is_initialized:
            self.ema = new_value
            self.is_initialized = True
            return "TRAINING", False
        
        # Update EMA
        self.ema = self.alpha * new_value + (1 - self.alpha) * self.ema
        # Update EMSD
        diff = abs(new_value - self.ema)
        self.emsd = self.alpha * diff + (1 - self.alpha) * self.emsd
        
        if self.emsd == 0:
            self.emsd = 0.001
        z_score = (new_value - self.ema) / self.emsd
        
        # Decision Logic
        if z_score > self.threshold:
            self.consecutive_anomalies += 1
            if self.consecutive_anomalies >= self.required_failures:
                # CHANGED: "DOWN" -> "SLOW RESPONSE" (Warning, not Fatal)
                return "WARNING: Slow Response", True
            else:
                return "Unstable", False
        else:
            self.consecutive_anomalies = 0
            return "UP", False

class MonitorState:
    def __init__(self):
        self.is_monitoring = False
        self.target_url: str = ""
        self.targets: List[str] = [] # Active Targets
        # ADDED: Passive Targets List
        self.passive_targets: List[str] = [] 
        
        self.detectors: Dict[str, SmartDetector] = {}
        self.histories: Dict[str, List[float]] = {}
        self.timestamps: Dict[str, List[float]] = {}
        self.baseline_avgs: Dict[str, float] = {}
        self.current_statuses: Dict[str, str] = {}
        self.http_status_codes: Dict[str, int] = {}

async def monitoring_loop(state: MonitorState):
    headers = {
        'User-Agent': 'Mozilla/5.0 (ServerPulse-AI/2.0; +https://serverpulse.ai)'
    }
    while state.is_monitoring:
        for target in state.targets:
            # Initialize latency for this iteration
            current_latency = 0
            start_time = time.time() # Start time is initialized here
            
            try:
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                    response = await client.head(target, headers=headers)
                current_latency = (time.time() - start_time) * 1000
                state.http_status_codes[target] = response.status_code
                
                # --- UPDATED HTTP LOGIC ---
                if response.status_code >= 500:
                    # 5xx means the Server crashed. This is "DOWN".
                    state.current_statuses[target] = f"SERVER DOWN ({response.status_code})"
                    update_history(state, target, current_latency) # Use calculated latency
                # ... inside monitoring_loop in monitor.py ...
                elif 400 <= response.status_code < 500:
                    # 4xx (404, 403) means Client Error/Firewall.
                    # CHANGED: Changed from "WARNING" to "ERROR" so it triggers status_down alerts.
                    state.current_statuses[target] = f"ERROR ({response.status_code})"
                    update_history(state, target, current_latency) # We still track latency as server responded
                else:
                    # 2xx/3xx OK
                    status_text, is_anomaly = state.detectors[target].update(current_latency)
                    if status_text == "TRAINING":
                        state.current_statuses[target] = "Learning Baseline..."
                    elif status_text == "WARNING: Slow Response":
                        # Changed from "CRITICAL" to match the warning logic
                        state.current_statuses[target] = "WARNING: High Latency"
                    elif status_text == "Unstable":
                        state.current_statuses[target] = "Unstable"
                    else:
                        state.current_statuses[target] = "Operational"
                    update_history(state, target, current_latency)
                    
            except httpx.ConnectTimeout:
                # Timeout is usually a network or firewall issue, not necessarily a dead server.
                # Changed to "WARNING"
                state.current_statuses[target] = "WARNING: Connection Timeout"
                # FIX: Calculate actual time waited instead of hardcoding 0
                current_latency = (time.time() - start_time) * 1000
                update_history(state, target, current_latency)
                
            except httpx.ConnectError:
                # Connection Refused usually means port is closed -> Server is actually Down.
                state.current_statuses[target] = "CONNECTION REFUSED"
                # FIX: Calculate actual time waited
                current_latency = (time.time() - start_time) * 1000
                update_history(state, target, current_latency)
                
            except Exception as e:
                state.current_statuses[target] = f"ERROR: {str(e)[:20]}"
                # FIX: Calculate actual time waited
                current_latency = (time.time() - start_time) * 1000
                update_history(state, target, current_latency)

            # --- ADDED: ALERT INTEGRATION ---
            # Check if this status triggers any alert rules
            # We use the status determined in the loop and the latency calculated
            current_status = state.current_statuses.get(target, "Unknown")
            check_service_alerts(target, current_status, current_latency)

        await asyncio.sleep(1.5) 

# --- NEW: PASSIVE MONITORING LOOP ---
# This loop runs less frequently (e.g., every 60s) to check passively discovered subdomains
# It does not maintain heavy history or EWMA states to save resources, but DOES trigger alerts.
async def passive_monitoring_loop(state: MonitorState):
    headers = {
        'User-Agent': 'Mozilla/5.0 (ServerPulse-AI/Passive-Scan/1.0; +https://serverpulse.ai)'
    }
    
    # Run a bit slower than active monitoring to save resources
    PASSIVE_SCAN_INTERVAL = 60 
    
    while state.is_monitoring:
        # Only run if there are passive targets
        if not state.passive_targets:
            await asyncio.sleep(PASSIVE_SCAN_INTERVAL)
            continue

        for target in state.passive_targets:
            current_latency = 0
            start_time = time.time() # Start time initialized
            current_status = "Unknown"
            
            try:
                # Use a shorter timeout for passive scanning to avoid getting stuck
                async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                    response = await client.head(target, headers=headers)
                current_latency = (time.time() - start_time) * 1000
                
                if response.status_code >= 500:
                    current_status = f"SERVER DOWN ({response.status_code})"
                elif 400 <= response.status_code < 500:
                    current_status = f"ERROR ({response.status_code})"
                else:
                    current_status = "Operational"
                    
            except httpx.ConnectTimeout:
                current_status = "WARNING: Connection Timeout"
                # FIX: Calculate actual time waited instead of hardcoding 0
                current_latency = (time.time() - start_time) * 1000
            except httpx.ConnectError:
                current_status = "CONNECTION REFUSED"
                # FIX: Calculate actual time waited
                current_latency = (time.time() - start_time) * 1000
            except Exception as e:
                current_status = f"ERROR: {str(e)[:20]}"
                # FIX: Calculate actual time waited
                current_latency = (time.time() - start_time) * 1000

            # --- ALERT INTEGRATION ---
            # Directly check alerts for this passive target. 
            # The updated alert.py handles the parent-domain logic automatically.
            check_service_alerts(target, current_status, current_latency)
            
        await asyncio.sleep(PASSIVE_SCAN_INTERVAL)

def update_history(state: MonitorState, target: str, val: float):
    if target not in state.histories:
        state.histories[target] = []
        state.timestamps[target] = []
    state.histories[target].append(val)
    state.timestamps[target].append(time.time())
    
    # Only update baseline if we have a valid detector (Active Targets)
    if target in state.detectors:
        state.baseline_avgs[target] = state.detectors[target].ema
    
    if len(state.histories[target]) > 50:
        state.histories[target].pop(0)
        state.timestamps[target].pop(0)