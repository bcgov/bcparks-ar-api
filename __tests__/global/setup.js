const AWS = require('aws-sdk');

const { REGION, ENDPOINT, TABLE_NAME, CONFIG_TABLE_NAME } = require('./settings');
const { logger } = require('../../lambda/logger');

module.exports = async () => {
  dynamoDb = new AWS.DynamoDB({
    region: REGION,
    endpoint: ENDPOINT
  });

  // TODO: This should pull in the JSON version of our serverless.yml!

  try {
    let res = await dynamoDb
      .createTable({
        TableName: TABLE_NAME,
        KeySchema: [
          {
            AttributeName: 'pk',
            KeyType: 'HASH'
          },
          {
            AttributeName: 'sk',
            KeyType: 'RANGE'
          }
        ],
        AttributeDefinitions: [
          {
            AttributeName: 'pk',
            AttributeType: 'S'
          },
          {
            AttributeName: 'sk',
            AttributeType: 'S'
          }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1
        }
      })
      .promise();

    await dynamoDb
      .createTable({
        TableName: CONFIG_TABLE_NAME,
        KeySchema: [
          {
            AttributeName: 'pk',
            KeyType: 'HASH'
          }
        ],
        AttributeDefinitions: [
          {
            AttributeName: 'pk',
            AttributeType: 'S'
          }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1
        }
      })
      .promise();
  } catch (err) {
    logger.error(err);
  }
};
