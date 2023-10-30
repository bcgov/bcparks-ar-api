resource "aws_dynamodb_table" "ar_table_name_cache" {
  name           = "${data.aws_ssm_parameter.db_name_cache.value}-${random_string.postfix.result}"
  hash_key       = "pk"
  billing_mode   = "PAY_PER_REQUEST"

  point_in_time_recovery {
    enabled = false
  }

  tags = {
    Name = "database-${random_string.postfix.result}"
  }

  attribute {
    name = "orcs"
    type = "S"
  }
}

resource "aws_dynamodb_table" "ar_table" {
  name           = "${data.aws_ssm_parameter.db_name.value}-${random_string.postfix.result}"
  hash_key       = "pk"
  range_key      = "sk"
  billing_mode   = "PAY_PER_REQUEST"

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "database-${random_string.postfix.result}"
  }

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  global_secondary_index {
    name               = "orcs-index"
    hash_key           = "orcs"
    projection_type    = "ALL"
  }
}

resource "aws_backup_vault" "backup_vault" {
  name        = "backup_vault-${random_string.postfix.result}"
}

resource "aws_backup_plan" "backup" {
  name = "backup_plan-${random_string.postfix.result}"

  rule {
    rule_name         = "backup_rule-${random_string.postfix.result}"
    target_vault_name = aws_backup_vault.backup_vault.name
    schedule          = "cron(0 12 * * ? *)"

    lifecycle {
      delete_after = 360
    }
  }
}
