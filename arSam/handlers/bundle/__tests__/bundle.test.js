const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { REGION, ENDPOINT } = require("../../../__tests__/settings");
const { getHashedText, deleteDB, createDB } = require("../../../__tests__/setup");
const { MOCK_BUNDLE } = require("../../../__tests__/mock_data.json");
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const jwt = require("jsonwebtoken");
const tokenContent = {
  resource_access: { "attendance-and-revenue": { roles: ["sysadmin"] } },
};
const token = jwt.sign(tokenContent, "defaultSecret");

async function setupDb(TABLE_NAME) {
  const dynamoClient = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT });
  await dynamoClient.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(MOCK_BUNDLE)
  }));
}

describe("Bundle Test", () => {
  const mockKeycloakRoles = {
    createKeycloakRole: jest.fn().mockImplementation(() =>
      Promise.resolve({
        id: '123',
        name: 'test-role',
      })
    )
  };

  const OLD_ENV = process.env;
  let hash;
  let TABLE_NAME;
  let NAME_CACHE_TABLE_NAME;
  let CONFIG_TABLE_NAME;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV }; // Make a copy of environment
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash;
    TABLE_NAME = process.env.TABLE_NAME;
    NAME_CACHE_TABLE_NAME = TABLE_NAME.concat("-nameCache");
    CONFIG_TABLE_NAME = TABLE_NAME.concat("-config");
    process.env.NAME_CACHE_TABLE_NAME = NAME_CACHE_TABLE_NAME;
    process.env.CONFIG_TABLE_NAME = CONFIG_TABLE_NAME;
    process.env.TABLE_NAME = TABLE_NAME;
    await createDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    await setupDb(TABLE_NAME);
  }, 20000);

  afterEach(async () => {
    await deleteDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    process.env = OLD_ENV; // Restore old environment
  });

  test("Handler 403 - Unauthenticated", async () => {
    const bundlesGet = require('../GET/index').handler;

    const response = await bundlesGet({
      headers: {
        Authorization: "None",
      },
      requestContext: {
        authorizer: {
          roles: "[\"sysadmin\"]",
          isAdmin: false,
          isAuthenticated: false,
        },
      },
    },
      null
    );
    expect(response.statusCode).toEqual(403);
  });

  test("Handler - 200, Return list of bundles", async () => {
    jest.mock('/opt/keycloakLayer', () => {
      return mockKeycloakRoles;
    });

    const bundlesGet = require('../GET/index').handler;

    const response = await bundlesGet({
      headers: {
        Authorization: "Bearer " + token,
      },
      requestContext: {
        authorizer: {
          roles: "[\"sysadmin\"]",
          isAdmin: true,
          isAuthenticated: true,
        },
      },
    },
      null
    );
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBeGreaterThan(0);
  });
});