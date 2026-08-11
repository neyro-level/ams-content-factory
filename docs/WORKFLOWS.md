# Workflows

Канонический business state хранится в PostgreSQL. Queue является исполнителем, но не state engine.
WorkflowRun, ContentProject, VideoProduction, RenderJob и Publication используют controlled transitions.
