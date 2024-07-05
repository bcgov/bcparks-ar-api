const { DynamoDB } = require('@aws-sdk/client-dynamodb');

const { REGION, ENDPOINT, TABLE_NAME, CONFIG_TABLE_NAME, NAME_CACHE_TABLE_NAME } = require('./settings');

module.exports = async () => {
  dynamoDb = new DynamoDB({
    region: REGION,
    endpoint: ENDPOINT
  });

  // TODO: This should pull in the JSON version of our serverless.yml!

  try {
    console.log("Creating main table.");
    await dynamoDb
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
          },
          {
            AttributeName: 'orcs',
            AttributeType: 'S'
          }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1
        },
        GlobalSecondaryIndexes: [
          {
            IndexName: 'orcs-index',
            KeySchema: [
              {
                AttributeName: 'orcs',
                KeyType: 'HASH'
              }
            ],
            Projection: {
              ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
              ReadCapacityUnits: 1,
              WriteCapacityUnits: 1
            }
          }
        ]
      });

    console.log("Creating name-cache table.");
    await dynamoDb
      .createTable({
        TableName: NAME_CACHE_TABLE_NAME,
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
      });

    console.log("Creating config table.");
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
      });
  } catch (err) {
    console.log(err);
  }
};
