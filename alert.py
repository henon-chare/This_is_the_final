# alert.py
import logging
import re # Import regex for domain parsing
from datetime import datetime, timedelta
from sqlalchemy import or_
from database import SessionLocal
from models import AlertRule, AlertHistory, Monitor

logger = logging.getLogger(__name__)

# Helper to extract root domain (e.g., api.google.com -> google.com)
def get_root_domain(url):
    try:
        # Remove protocol
        domain = url.replace("https://", "").replace("http://", "").split("/")[0]
        # Split by dot
        parts = domain.split(".")
        if len(parts) > 2:
            return ".".join(parts[-2:])
        return domain
    except:
        return url

def check_service_alerts(target_url, current_status, current_latency):
    """
    Evaluates the current monitoring state against user-defined AlertRules.
    Supports "Main Domain" grouping: selecting 'google.com' alerts for 'api.google.com'.
    """
    db = SessionLocal()
    try:
        # 1. Resolve Target URL to Monitor DB Entry
        monitor = db.query(Monitor).filter(Monitor.target_url == target_url).first()
        
        # --- FIX: AGGREGATE RELEVANT MONITOR IDs ---
        # We need to check rules for: 1. The exact target, 2. The parent domain (if applicable)
        target_monitor_ids = set()
        user_id_to_check = None
        monitor_id_to_use = None # The ID to use for saving the Alert History

        if monitor:
            target_monitor_ids.add(monitor.id)
            user_id_to_check = monitor.user_id
            monitor_id_to_use = monitor.id

        # Regardless of whether 'monitor' exists, try to find the PARENT domain monitor.
        # This ensures that if I have a rule for 'example.com', it applies to 'ma.example.com'
        # even if 'ma.example.com' is tracked as a separate monitor in the DB.
        root_domain = get_root_domain(target_url)
        if root_domain:
            parent_monitor = db.query(Monitor).filter(
                or_(
                    Monitor.target_url == f"http://{root_domain}",
                    Monitor.target_url == f"https://{root_domain}"
                )
            ).first()
            
            if parent_monitor:
                target_monitor_ids.add(parent_monitor.id)
                # If we didn't find a user_id earlier (e.g. untracked subdomain), use parent's
                if not user_id_to_check:
                    user_id_to_check = parent_monitor.user_id
                # If no specific monitor ID was set, default to parent for history tracking
                if not monitor_id_to_use:
                    monitor_id_to_use = parent_monitor.id

        # If we still can't identify the user, we can't proceed
        if not user_id_to_check:
            return

        # 2. Calculate Root Domain for Grouping Logic (Legacy fallback for Global Rules)
        current_root_domain = get_root_domain(target_url)

        # 3. Fetch Active Rules
        # We fetch rules that are:
        # a) For ANY of the relevant Monitor IDs (Target OR Parent)
        # b) Global Rules (target_id is None)
        rules = db.query(AlertRule).filter(
            AlertRule.user_id == user_id_to_check,
            AlertRule.type == "service",
            AlertRule.is_active == True,
            or_(
                AlertRule.target_id.in_(target_monitor_ids),
                AlertRule.target_id == None
            )
        ).all()

        for rule in rules:
            # --- LOGIC: SKIP IF GLOBAL RULE DOESN'T MATCH DOMAIN ---
            # If target_id is None, it's a global rule.
            # We check if the rule has a saved target_url (new feature) first.
            if rule.target_id is None:
                match = False
                
                # PRIMARY CHECK: Use the new target_url column
                if rule.target_url:
                    # Normalize both for comparison (remove http/s)
                    clean_rule_url = rule.target_url.replace("https://", "").replace("http://", "").rstrip("/")
                    clean_current_url = target_url.replace("https://", "").replace("http://", "").rstrip("/")
                    
                    # Check if current monitored URL ends with the rule target (supports subdomains)
                    if clean_current_url.endswith(clean_rule_url):
                        match = True
                
                # SECONDARY CHECK (Fallback): Check if root domain is in rule name (Old logic)
                if not match and current_root_domain in rule.name:
                    match = True
                
                if not match:
                    continue # Skip this rule, it doesn't apply to this target

            triggered = False
            message = ""

            # --- LOGIC: STATUS DOWN ---
            if rule.condition == "status_down":
                failure_keywords = ["DOWN", "ERROR", "REFUSED", "TIMEOUT", "NOT FOUND", "CRITICAL"]
                if any(kw in current_status for kw in failure_keywords):
                    triggered = True
                    # Display the specific subdomain that triggered the alert
                    message = f"CRITICAL: {target_url} reported status '{current_status}'. (Rule: {rule.name})"

            # --- LOGIC: HIGH LATENCY ---
            elif rule.condition == "response_time_high":
                thresh_str = rule.threshold if rule.threshold else ">1000"
                
                # --- FIX: Handle numeric only thresholds (e.g. "500" -> ">500") ---
                if thresh_str.strip().isdigit():
                    thresh_str = ">" + thresh_str

                operator = ">"
                limit = 1000

                if ">=" in thresh_str:
                    operator = ">="; limit = int(thresh_str.replace(">=", ""))
                elif ">" in thresh_str:
                    operator = ">"; limit = int(thresh_str.replace(">", ""))
                elif "<=" in thresh_str:
                    operator = "<="; limit = int(thresh_str.replace("<=", ""))
                elif "<" in thresh_str:
                    operator = "<"; limit = int(thresh_str.replace("<", ""))

                is_breached = False
                if operator == ">=" and current_latency >= limit: is_breached = True
                elif operator == ">" and current_latency > limit: is_breached = True
                elif operator == "<=" and current_latency <= limit: is_breached = True
                elif operator == "<" and current_latency < limit: is_breached = True

                if is_breached:
                    triggered = True
                    # Display the specific subdomain that triggered the alert
                    message = f"WARNING: {target_url} latency {current_latency:.2f}ms > {limit}ms (Rule: {rule.name})"

            # --- DEBOUNCE & SAVE ---
            if triggered:
                # --- FIX: URL-AWARE DEBOUNCING ---
                # We check if this SPECIFIC target_url triggered this rule in the last 30 minutes.
                # This ensures that if 'ma.example.com' and 'mb.example.com' both trigger the 
                # same parent rule, BOTH alerts are saved, not just the first one.
                recent_alert = db.query(AlertHistory).filter(
                    AlertHistory.rule_id == rule.id,
                    AlertHistory.source_id == monitor_id_to_use,
                    AlertHistory.triggered_at > datetime.utcnow() - timedelta(minutes=30),
                    AlertHistory.message.like(f"%{target_url}%") # Crucial: Check for the specific URL
                ).first()

                if not recent_alert:
                    new_alert = AlertHistory(
                        user_id=user_id_to_check,
                        rule_id=rule.id,
                        source_type="monitor",
                        source_id=monitor_id_to_use,
                        message=message,
                        severity=rule.severity,
                        channel=rule.channel,
                        status="sent"
                    )
                    db.add(new_alert)
                    db.commit()
                    logger.info(f"ALERT TRIGGERED: {message}")
                else:
                    logger.debug(f"ALERT DEBOUNCED: Rule {rule.id} for {target_url} (Recent alert exists for this specific URL)")

    except Exception as e:
        logger.error(f"Alert Logic Error: {e}")
        db.rollback()
    finally:
        db.close()