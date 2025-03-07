const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { REGION, ENDPOINT } = require("../../../__tests__/settings");
const { MOCK_REGION, MOCK_SECTION, MOCK_MANAGEMENT_AREA } = require("../../../__tests__/mock_data.json");
const { getHashedText, deleteDB, createDB } = require("../../../__tests__/setup");
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const jwt = require("jsonwebtoken");
const tokenContent = {
  resource_access: { "attendance-and-revenue": { roles: ["sysadmin"] } },
};
const token = jwt.sign(tokenContent, "defaultSecret");


async function setupDb(TABLE_NAME) {
  const dynamoClient = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT });
  for (const dataItem of [MOCK_REGION, MOCK_SECTION, MOCK_MANAGEMENT_AREA]) {
    await dynamoClient.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(dataItem)
    }));
  }
}

describe("Region Test", () => {
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
    const regionsGet = require('../GET/index').handler;

    const response = await regionsGet({
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

  test("Handler - 200, Return list of regions", async () => {
    jest.mock('/opt/keycloakLayer', () => {
      return mockKeycloakRoles;
    });

    const regionsGet = require('../GET/index').handler;

    const response = await regionsGet({
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
    expect(response.body.length).toBeGreaterThan(0);
  });

  test("Handler - 200, Return region with details", async () => {
    jest.mock('/opt/keycloakLayer', () => {
      return mockKeycloakRoles;
    });

    const regionsGet = require('../GET/index').handler;

    const response = await regionsGet({
      headers: {
        Authorization: "Bearer " + token,
      },
      queryStringParameters: {
        regionId: MOCK_REGION.sk
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
    expect(body.sections.length).toBeGreaterThan(0);
    expect(body.sections[0].managementAreas.length).toBeGreaterThan(0);
  });
});