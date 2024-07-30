const { DynamoDBClient, CreateTableCommand, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');
const { REGION, ENDPOINT } = require('./settings');
const crypto = require('crypto');


async function createDB (TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME) {
  dynamoDb = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  try {
    let params =  {
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
      }
      

    await dynamoDb.send(new CreateTableCommand(params));

    params = {
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

      }
    await dynamoDb.send(new CreateTableCommand(params))

    params = {
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
    }
    await dynamoDb.send(new CreateTableCommand(params));

  } catch (err) {
    console.log(err);
  }
};

function getHashedText(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

async function deleteDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME) {
  const dynamoDb = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  try {
    //Delete Main Table
    let param = {
        TableName: TABLE_NAME
      };

    await dynamoDb.send(new DeleteTableCommand(param));

    //Delete NameChache Table
    param = {
      TableName: NAME_CACHE_TABLE_NAME 
    };
    await dynamoDb.send(new DeleteTableCommand(param));

    //Delete Config Table
    param = {
      TableName: CONFIG_TABLE_NAME
    };
    await dynamoDb.send(new DeleteTableCommand(param));


  } catch (err) {
    console.log(err);
  }
}

module.exports = {
  createDB,
  getHashedText,
  deleteDB
}