# Workflows

Канонический business state хранится в PostgreSQL. Queue является исполнителем, но не state engine.
WorkflowRun, ContentProject, VideoProduction, RenderJob и Publication используют controlled transitions.

## QC reports

`QcReport` создаётся только application service после проверки tenant/brand scope. Technical, visual и
content sections обязательны; compliance optional. Status вычисляется fail-closed: любой failed section
даёт `FAILED`, passing sections с issues дают `WARNING`, а `PASSED` возможен только при отсутствии
issues во всех supplied sections.
