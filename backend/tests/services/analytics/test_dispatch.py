import uuid
from unittest.mock import MagicMock, patch

from app.services.analytics.dispatch import EcsRunTaskDispatcher


def test_dispatch_is_a_noop_when_ecs_not_configured():
    dispatcher = EcsRunTaskDispatcher()
    with patch("app.services.analytics.dispatch.settings") as mock_settings, \
         patch("app.services.analytics.dispatch.boto3.client") as mock_client:
        mock_settings.ecs_cluster_arn = ""
        mock_settings.ecs_task_definition_arn = ""
        result = dispatcher.dispatch(uuid.uuid4())
    mock_client.assert_not_called()
    # False signals "nothing was actually placed" -- callers use this to
    # roll back an already-committed try_claim_recompute() claim.
    assert result is False


def _configure(mock_settings):
    mock_settings.ecs_cluster_arn = "arn:aws:ecs:ap-south-1:123:cluster/unifolio"
    mock_settings.ecs_task_definition_arn = "arn:aws:ecs:ap-south-1:123:task-definition/analytics-recompute"
    mock_settings.ecs_container_name = "analytics-recompute"
    mock_settings.ecs_subnet_ids = "subnet-1,subnet-2"
    mock_settings.ecs_security_group_ids = "sg-1"
    mock_settings.aws_region = "ap-south-1"


def test_dispatch_calls_ecs_run_task_when_configured():
    dispatcher = EcsRunTaskDispatcher()
    user_id = uuid.uuid4()
    mock_ecs = MagicMock()
    mock_ecs.run_task.return_value = {"failures": []}

    with patch("app.services.analytics.dispatch.settings") as mock_settings, \
         patch("app.services.analytics.dispatch.boto3.client", return_value=mock_ecs) as mock_client:
        _configure(mock_settings)
        result = dispatcher.dispatch(user_id)

    assert result is True
    mock_client.assert_called_once_with("ecs", region_name="ap-south-1")
    mock_ecs.run_task.assert_called_once()
    call_kwargs = mock_ecs.run_task.call_args.kwargs
    assert call_kwargs["cluster"] == "arn:aws:ecs:ap-south-1:123:cluster/unifolio"
    assert call_kwargs["taskDefinition"] == "arn:aws:ecs:ap-south-1:123:task-definition/analytics-recompute"
    command = call_kwargs["overrides"]["containerOverrides"][0]["command"]
    assert str(user_id) in command


def test_dispatch_logs_error_when_run_task_reports_a_placement_failure():
    # RunTask can return 200 with no task placed -- failures land in the
    # response body, not an exception (Finding #4).
    dispatcher = EcsRunTaskDispatcher()
    user_id = uuid.uuid4()
    mock_ecs = MagicMock()
    mock_ecs.run_task.return_value = {
        "failures": [{"arn": "arn:aws:ecs:...", "reason": "RESOURCE:FARGATE"}]
    }

    with patch("app.services.analytics.dispatch.settings") as mock_settings, \
         patch("app.services.analytics.dispatch.boto3.client", return_value=mock_ecs), \
         patch("app.services.analytics.dispatch.logger") as mock_logger:
        _configure(mock_settings)
        result = dispatcher.dispatch(user_id)

    assert result is False
    mock_logger.error.assert_called_once()
    mock_logger.info.assert_not_called()
