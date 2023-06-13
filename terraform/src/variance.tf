#getVariance
resource "aws_lambda_function" "activityGetLambda" {
  function_name = "activity-get-${random_string.postfix.result}"

  filename         = "artifacts/activityGet.zip"
  source_code_hash = filebase64sha256("artifacts/activityGet.zip")

  handler = "lambda/activity/GET/index.handler"
  runtime = "nodejs14.x"
  timeout = 30
  publish = "true"

  memory_size = 128

  role = aws_iam_role.databaseReadRole.arn

  environment {
    variables = {
      SSO_ISSUER  = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI = data.aws_ssm_parameter.sso_jwksuri.value,
      TABLE_NAME  = aws_dynamodb_table.ar_table.name,
      LOG_LEVEL   = "info"
    }
  }
}

resource "aws_lambda_alias" "activityGetLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.activityGetLambda.function_name
  function_version = aws_lambda_function.activityGetLambda.version
}

resource "aws_lambda_permission" "activityGetPermission" {
  statement_id  = "activityGetPermissionInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.activityGetLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/activity"
}

#postVariance
resource "aws_lambda_function" "activityPostLambda" {
  function_name = "activity-post-${random_string.postfix.result}"

  filename         = "artifacts/activityPost.zip"
  source_code_hash = filebase64sha256("artifacts/activityPost.zip")

  handler = "lambda/activity/POST/index.handlePost"
  runtime = "nodejs14.x"
  timeout = 30
  publish = "true"

  memory_size = 128

  role = aws_iam_role.databaseReadRole.arn

  environment {
    variables = {
      SSO_ISSUER  = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI = data.aws_ssm_parameter.sso_jwksuri.value,
      TABLE_NAME  = aws_dynamodb_table.ar_table.name,
      LOG_LEVEL   = "info"
    }
  }
}

resource "aws_lambda_alias" "activityPostLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.activityPostLambda.function_name
  function_version = aws_lambda_function.activityPostLambda.version
}

resource "aws_lambda_permission" "activityPostPermission" {
  statement_id  = "activityPostPermissionInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.activityPostLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/activity"
}

#putVariance
resource "aws_lambda_function" "activityPutLambda" {
  function_name = "activity-put-${random_string.postfix.result}"

  filename         = "artifacts/activityPut.zip"
  source_code_hash = filebase64sha256("artifacts/activityPut.zip")

  handler = "lambda/activity/PUT/index.handlePut"
  runtime = "nodejs14.x"
  timeout = 30
  publish = "true"

  memory_size = 128

  role = aws_iam_role.databaseReadRole.arn

  environment {
    variables = {
      SSO_ISSUER  = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI = data.aws_ssm_parameter.sso_jwksuri.value,
      TABLE_NAME  = aws_dynamodb_table.ar_table.name,
      LOG_LEVEL   = "info"
    }
  }
}

resource "aws_lambda_alias" "activityPutLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.activityPutLambda.function_name
  function_version = aws_lambda_function.activityPutLambda.version
}

resource "aws_lambda_permission" "activityPutPermission" {
  statement_id  = "activityPutPermissionInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.activityPutLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/PUT/activity"
}

# Resources - variances
module "activityResource" {
  source               = "./modules/cors-enabled-api-resource"
  resource_rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  resource_path_part   = "activity"
}

// Defines the HTTP GET /activity API
resource "aws_api_gateway_method" "activityGet" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = module.activityResource.resource.id
  http_method   = "GET"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "activityGetIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = module.activityResource.resource.id
  http_method = aws_api_gateway_method.activityGet.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.activityGetLambda.invoke_arn
}

// Defines the HTTP POST /activity API
resource "aws_api_gateway_method" "activityPost" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = module.activityResource.resource.id
  http_method   = "POST"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "activityPostIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = module.activityResource.resource.id
  http_method = aws_api_gateway_method.activityPost.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.activityPostLambda.invoke_arn
}

// Defines the HTTP PUT /activity API
resource "aws_api_gateway_method" "activityPut" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = module.activityResource.resource.id
  http_method   = "PUT"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "activityPutIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = module.activityResource.resource.id
  http_method = aws_api_gateway_method.activityPut.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.activityPutLambda.invoke_arn
}
