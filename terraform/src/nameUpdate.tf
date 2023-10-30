resource "aws_lambda_function" "name_update" {
  function_name = "nameUpdate-${random_string.postfix.result}"

  filename         = "artifacts/nameUpdate.zip"
  source_code_hash = filebase64sha256("artifacts/nameUpdate.zip")

  handler     = "lambda/nameUpdate/index.handler"
  runtime     = "nodejs18.x"
  memory_size = 512
  timeout     = 300
  publish     = "true"

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.ar_table.name,
      NAME_CACHE_TABLE_NAME = aws_dynamodb_table.ar_table_name_cache.name,
      DATA_REGISTER_NAME_ENDPOINT = data.aws_ssm_parameter.data_register_name_endpoint.value,
      LOG_LEVEL  = "debug"
    }
  }
  role = aws_iam_role.databaseReadRole.arn
}

resource "aws_lambda_alias" "name_update_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.name_update.function_name
  function_version = aws_lambda_function.name_update.version
}

resource "aws_cloudwatch_event_rule" "name_update_every_midnight" {
  name                = "name-update-every-midnight"
  description         = "Executes nightly"
  schedule_expression = "cron(* 0 * * ? *)"
}

resource "aws_cloudwatch_event_target" "name_update_every_midnight" {
  rule      = aws_cloudwatch_event_rule.name_update_every_midnight.name
  target_id = "name_update"
  arn       = aws_lambda_function.name_update.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_name_update" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.name_update.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.name_update_every_midnight.arn
}
