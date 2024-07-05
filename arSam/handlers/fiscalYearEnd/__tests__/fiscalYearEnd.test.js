const AWS = require('aws-sdk');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const { REGION, ENDPOINT, TABLE_NAME } = require('../../../__tests__/settings');
const { FISCAL_YEAR_LOCKS2 } = require('../../../__tests__/mock_data.json');

const jwt = require('jsonwebtoken');
const token = jwt.sign({ resource_access: { 'attendance-and-revenue': { roles: ['sysadmin'] } } }, 'defaultSecret');

async function setupDb() {
  new AWS.DynamoDB({
    region: REGION,
    endpoint: ENDPOINT
  });
  docClient = new DocumentClient({
    region: REGION,
    endpoint: ENDPOINT,
    convertEmptyValues: true
  });

  for (const item of FISCAL_YEAR_LOCKS2) {
    await (genericPutDocument(item));
  }
}

async function genericPutDocument(item) {
  return await docClient
    .put({
      TableName: TABLE_NAME,
      Item: item
    })
    .promise();
}

describe('Fiscal Year End Test', () => {
  const OLD_ENV = process.env;
  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV }; // Make a copy of environment
  });

  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  beforeAll(async () => {
    return await setupDb();
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
