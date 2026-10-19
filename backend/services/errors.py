class AnalysisError(Exception):
    """Domain error that is safe to show to clients (fixed message, no provider detail)."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status
