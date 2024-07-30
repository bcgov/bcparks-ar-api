const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { getHashedText, deleteDB, createDB } = require("../../../__tests__/setup");
const { REGION, ENDPOINT } = require('../../../__tests__/settings');
const { FISCAL_YEAR_LOCKS2 } = require('../../../__tests__/mock_data.json');

const jwt = require('jsonwebtoken');
const token = jwt.sign({ resource_access: { 'attendance-and-revenue': { roles: ['sysadmin'] } } }, 'defaultSecret');

async function setupDb(TABLE_NAME) {
  
  for (const item of FISCAL_YEAR_LOCKS2) {
    await (genericPutDocument(item, TABLE_NAME));
  }
}

async function genericPutDocument(item, TABLE_NAME) {
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  const params = {
      TableName: TABLE_NAME,
      Item: marshall(item)
    }
  await dynamoClient.send(new PutItemCommand(params));

}

describe('Fiscal Year End Test', () => {
  const OLD_ENV = process.env;
  let hash
  let TABLE_NAME
  let NAME_CACHE_TABLE_NAME
  let CONFIG_TABLE_NAME
  
  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV }; // Make a copy of environment
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME;
    NAME_CACHE_TABLE_NAME = TABLE_NAME.concat("-nameCache");
    CONFIG_TABLE_NAME = TABLE_NAME.concat("-config");
    await createDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    await setupDb(TABLE_NAME);
  });

  afterEach(() => {
    deleteDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    process.env = OLD_ENV; // Restore old environment
  });

  test('Handler - 200 GET fiscal year end', async () => {
    const fiscalYearEndGET = require('../GET/index');
    const obj = await fiscalYearEndGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token
        },
        requestContext: {
          authorizer: {
            roles: "[\"sysadmin\"]",
            isAdmin: true,
            isAuthenticated: true,
          },
        },
        queryStringParameters: {
          fiscalYearEnd: FISCAL_YEAR_LOCKS2[0].sk
        }
      }, null);
    expect(JSON.parse(obj.body)).toMatchObject(FISCAL_YEAR_LOCKS2[0]);
  });

  test('Handler - 200 GET All fiscal year end objects', async () => {
    const fiscalYearEndGET = require('../GET/index');
    const response = await fiscalYearEndGET.handler({
      headers: {
        Authorization: "Bearer " + token
      },
      requestContext: {
        authorizer: {
          roles: "[\"sysadmin\"]",
          isAdmin: true,
          isAuthenticated: true,
        },
      },
    }, null);

    expect(response.statusCode).toBe(200);
  });

  test('HandleLock - 200 lock fiscal year', async () => {
    const fiscalYearEndPOST = require('../POST/index');
    const response = await fiscalYearEndPOST.lockFiscalYear({
      headers: {
        Authorization: "Bearer " + token
      },
      requestContext: {
        authorizer: {
          roles: "[\"sysadmin\"]",
          isAdmin: true,
          isAuthenticated: true,
        },
      },
      queryStringParameters: {
        fiscalYearEnd: "2017"
      }
    }, null);

    expect(response.statusCode).toBe(200);
  });

  test('HandleLock - 200 unlock fiscal year', async () => {
    const fiscalYearEndPOST = require('../POST/index');
    const response = await fiscalYearEndPOST.unlockFiscalYear({
      headers: {
        Authorization: "Bearer " + token
      },
      requestContext: {
        authorizer: {
          roles: "[\"sysadmin\"]",
          isAdmin: true,
          isAuthenticated: true,
        },
      },
      queryStringParameters: {
        fiscalYearEnd: "2017"
      }
    }, null);

    expect(response.statusCode).toBe(200);
  });

  test('HandleLock - 403 unlock fiscal year without perms', async () => {
    const fiscalYearEndPOST = require('../POST/index');
    const response = await fiscalYearEndPOST.unlockFiscalYear({
      headers: {
        Authorization: "Bearer " + token
      },
      requestContext: {
        authorizer: {
          roles: "[\"public\"]",
          isAdmin: false,
          isAuthenticated: false,
        },
      },
      queryStringParameters: {
        fiscalYearEnd: "2017"
      }
    }, null);

    expect(response.statusCode).toBe(403);
  });

});
