# alerts.py
from pydantic import BaseModel, Field
from typing import Optional, List, Literal

class AlertRuleBase(BaseModel):
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