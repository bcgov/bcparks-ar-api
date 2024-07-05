const { DynamoDB } = require('@aws-sdk/client-dynamodb');

const { REGION, ENDPOINT, TABLE_NAME, CONFIG_TABLE_NAME, NAME_CACHE_TABLE_NAME } = require('./settings');
const { logger } = require('../../lambda/logger');

module.exports = async () => {
  dynamoDb = new DynamoDB({
    region: REGION,
    endpoint: ENDPOINT
  });

  try {
    await dynamoDb
      .deleteTable({
        TableName: TABLE_NAME
      });
    await dynamoDb
      .deleteTable({
        TableName: NAME_CACHE_TABLE_NAME
      });
    await dynamoDb
      .deleteTable({
        TableName: CONFIG_TABLE_NAME
      });
  } catch (err) {
    logger.error(err);
  }
};
