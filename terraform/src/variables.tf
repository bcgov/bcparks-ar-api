variable "target_aws_account_id" {
  description = "AWS workload account id"
}

variable "aws_region" {
  description = "The AWS region things are created in"
  # default     = "ca-central-1"
}

variable "target_env" {
  description = "target environment"
}

data "aws_ssm_parameter" "db_name" {
  name = "/parks-ar-api/db-name"
}

data "aws_ssm_parameter" "db_name_cache" {
  name = "/parks-ar-api/db-name-cache"
}

data "aws_ssm_parameter" "data_register_name_endpoint" {
  name = "/parks-ar-api/data-register-name-endpoint"
}

data "aws_ssm_parameter" "data_register_name_api_key" {
  name = "/parks-ar-api/data-register-name-api-key"
}

data "aws_ssm_parameter" "s3_bucket_assets" {
  name = "/parks-ar-api/s3-bucket-assets"
}

data "aws_ssm_parameter" "s3_bucket_assets_name" {
  name = "/parks-ar-api/s3-bucket-assets-name"
}

data "aws_ssm_parameter" "aws_account_list" {
  name = "/parks-ar-api/aws_account_list"
}

data "aws_ssm_parameter" "webhook_url" {
  name = "/parks-ar-api/webhook_url"
}

data "aws_ssm_parameter" "origin_id_assets" {
  name = "/parks-ar-api/origin-id-assets"
}

data "aws_ssm_parameter" "sso_issuer" {
  name = "/parks-ar-api/sso-issuer"
}

data "aws_ssm_parameter" "sso_origin" {
  name = "/parks-ar-api/sso-origin"
}

data "aws_ssm_parameter" "sso_jwksuri" {
  name = "/parks-ar-api/sso-jwksuri"
}

data "aws_ssm_parameter" "keycloak_client_id" {
  name = "/parks-ar-api/keycloak-client-id"
}