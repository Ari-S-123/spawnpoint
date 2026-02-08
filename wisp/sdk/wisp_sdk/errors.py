class WispError(Exception):
    """Base exception for all Wisp SDK errors."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)

class WispAPIError(WispError):
    """Raised when the Wisp API returns a 4xx or 5xx error."""
    def __init__(self, message: str, status_code: int):
        self.status_code = status_code
        super().__init__(f"{message} (Status: {status_code})")

class WispTimeoutError(WispError):
    """Raised when a tool execution times out (504)."""
    pass

class WispConnectionError(WispError):
    """Raised when the client cannot connect to the Wisp Gateway."""
    pass
