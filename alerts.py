# alerts.py
from pydantic import BaseModel, Field
from typing import Optional, List, Literal

class AlertRuleBase(BaseModel):
    name: str
    # Made target_id Optional because the current UI doesn't have a selector for it yet
    target_id: Optional[int] = Field(None, description="ID of the service or domain") 
    condition: str = Field(..., description="Condition string (e.g. 'status_down', 'response_time')")
    threshold: str = Field(..., description="Threshold value (string to allow 'days_left' or numbers)")
    severity: Literal["critical", "high", "warning", "info"] = Field(..., description="Severity level")
    channel: Literal["email", "sms", "slack", "webhook"] = Field(..., description="Notification channel")
    escalate_min: int = Field(0, description="Minutes to wait before escalation")
    type: str = "service" # Added to support UI

class AlertRuleCreate(AlertRuleBase):
    pass

class AlertRuleResponse(AlertRuleBase):
    id: int
    is_active: bool = True
    
    class Config:
        from_attributes = True

class AlertHistoryResponse(BaseModel):
    id: int
    rule_id: Optional[int]
    time: str
    channel: str
    status: str
    recipient: str
    message: Optional[str] = None
    
    class Config:
        from_attributes = True