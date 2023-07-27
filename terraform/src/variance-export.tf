# ============= EXPORT INVOKABLE =============
resource "aws_lambda_function" "varianceExportInvokableLambda" {
  function_name = "variance-export-invokable-${random_string.postfix.result}"

  filename         = "artifacts/varianceExportInvokable.zip"
  source_code_hash = filebase64sha256("artifacts/varianceExportInvokable.zip")

  handler = "lambda/export-variance/invokable/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  timeout = 900
  memory_size = 2048

  environment {
    variables = {
      TABLE_NAME                                = aws_dynamodb_table.ar_table.name,
      FILE_PATH                                 = "/tmp/",
      FILE_NAME                                 = "A&R_Variance_Report",
      SSO_ISSUER                                = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI                               = data.aws_ssm_parameter.sso_jwksuri.value,
      S3_BUCKET_DATA                            = aws_s3_bucket.bcgov-parks-ar-assets.id,
      LOG_LEVEL                                 = "info"
    }
  }
  role = aws_iam_role.varianceExportInvokeRole.arn
}

resource "aws_lambda_alias" "variance_export_invokable_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.varianceExportInvokableLambda.function_name
  function_version = aws_lambda_function.varianceExportInvokableLambda.version
}

# ============= EXPORT GET =============
resource "aws_lambda_function" "varianceExportGetLambda" {
  function_name = "variance-export-get-${random_string.postfix.result}"

  filename         = "artifacts/varianceExportGet.zip"
  source_code_hash = filebase64sha256("artifacts/varianceExportGet.zip")

  handler = "lambda/export-variance/GET/index.handler"
  runtime = "nodejs14.x"
  timeout = 30
  publish = "true"

  memory_size = 128

  role = aws_iam_role.varianceExportGetRole.arn

  environment {
    variables = {
      TABLE_NAME           = aws_dynamodb_table.ar_table.name,
      SSO_ISSUER           = data.aws_ssm_parameter.sso_issuer.value
      SSO_JWKSURI          = data.aws_ssm_parameter.sso_jwksuri.value,
      S3_BUCKET_DATA       = aws_s3_bucket.bcgov-parks-ar-assets.id,
      EXPORT_FUNCTION_NAME = aws_lambda_function.varianceExportInvokableLambda.function_name,
      LOG_LEVEL            = "info"
    }
  }
}

resource "aws_lambda_alias" "variance_export_get_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.varianceExportGetLambda.function_name
  function_version = aws_lambda_function.varianceExportGetLambda.version
}

resource "aws_api_gateway_integration" "varianceExportGetIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.varianceExportResource.id
  http_method = aws_api_gateway_method.varianceExportGet.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.varianceExportGetLambda.invoke_arn
}

resource "aws_lambda_permission" "varianceExportGetPermission" {
  statement_id  = "varianceExportGetPermissionInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.varianceExportGetLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/export-variance"
}

resource "aws_api_gateway_resource" "varianceExportResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "export-variance"
}

resource "aws_api_gateway_method" "varianceExportGet" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.varianceExportResource.id
  http_method   = "GET"
  authorization = "NONE"
}

//CORS
resource "aws_api_gateway_method" "variance_export_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.varianceExportResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "variance_export_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.varianceExportResource.id
  http_method = aws_api_gateway_method.variance_export_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.variance_export_options_method]
}

resource "aws_api_gateway_integration" "variance_export_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.varianceExportResource.id
  http_method = aws_api_gateway_method.variance_export_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.export_options_method]
}

resource "aws_api_gateway_integration_response" "variance_export_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.varianceExportResource.id
  http_method = aws_api_gateway_method.variance_export_options_method.http_method

  status_code = aws_api_gateway_method_response.variance_export_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.variance_export_options_200]
}
