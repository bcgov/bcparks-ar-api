const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { REGION, ENDPOINT } = require("../../../__tests__/settings");
const { getHashedText, deleteDB, createDB } = require("../../../__tests__/setup");
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const jwt = require("jsonwebtoken");
const tokenContent = {
  resource_access: { "attendance-and-revenue": { roles: ["sysadmin"] } },
};
const token = jwt.sign(tokenContent, "defaultSecret");

async function setupDb(TABLE_NAME) {
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  let params1 = {
    TableName: TABLE_NAME,
    Item: marshall({
      pk: `variance::0001::202201`,
      sk: `0403::Day Use`,
      fields: { SS: ["peopleAndVehiclesVehicle"] },
      notes: "A Note",
      resolved: false,
    }),
  };
  await dynamoClient.send(new PutItemCommand(params1))

  let params2 = {
    TableName: TABLE_NAME,
    Item: marshall({
      pk: `variance::0001::202201`,
      sk: `0403::Frontcountry Camping`,
      fields: { SS: ["peopleAndVehiclesVehicle"] },
      notes: "A different note",
      resolved: false,
    }),
  };
  await dynamoClient.send(new PutItemCommand(params2))

  let params3 = {
    TableName: TABLE_NAME,
    Item: marshall({
      pk: `variance::0001::202202`,
      sk: `0403::Day Use`,
      fields: { SS: ["peopleAndVehiclesVehicle"] },
      notes: "A Note",
      resolved: false,
    }),
  }
  await dynamoClient.send(new PutItemCommand(params3))
}

describe("Variance Test", () => {
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
  }, 20000);

  afterEach(() => {
    deleteDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    process.env = OLD_ENV; // Restore old environment
  });

  const mockedUnauthenticatedInvalidUser = {
    roleFilter: jest.fn((records, roles) => {
      return {}
    }) 
  };

  const mockedLimitedUser = {
    roleFilter: jest.fn((records, roles) => {
      return records.filter((park) => park.orcs === "0041");
    }),
  };

  const mockedSysadmin = {
    roleFilter: jest.fn((records, roles) => {
      return records;
    }),
  };

  test("Variance GET Single PK Success", async () => {
    jest.mock("/opt/permissionLayer", () => {
      return mockedSysadmin;
    });

    const varianceGET = require("../GET/index");
    const response = await varianceGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: ["[\"sysadmin\"]"],
            isAdmin: true,
            isAuthenticated: true
          }
        },
        queryStringParameters: {
          orcs: '0001',
          date: "202201",
        },
      },
      null
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.length === 2);
  });

  test("Variance GET Single SK Success", async () => {
    jest.mock("/opt/permissionLayer", () => {
      return mockedSysadmin;
    });

    const varianceGET = require("../GET/index");
    const response = await varianceGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: ["[\"sysadmin\"]"],
            isAdmin: true,
            isAuthenticated: true
          }
        },
        queryStringParameters: {
          orcs: '0001',
          activity: "Day Use",
          date: "202201",
          subAreaId: "0403",
        },
      },
      null
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.length === 1);
  });

  test("Variance GET Success 200 but no permissions for records", async () => {
    jest.mock("/opt/permissionLayer", () => {
      return mockedLimitedUser;
    });

    const varianceGET = require("../GET/index");
    const response = await varianceGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: ["[\"0041:0084\"]"],
            isAdmin: false,
            isAuthenticated: true
          }
        },
        queryStringParameters: {
          orcs: '0001',
          activity: "Day Use",
          date: "202201",
          subAreaId: "0403",
        },
      },
      null
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.length === 0);
  });

  test("Variance GET FAIL 403 public user", async () => {
    jest.mock("/opt/permissionLayer", () => {
      return mockedUnauthenticatedInvalidUser;
    });

    const varianceGET = require("../GET/index");
    const response = await varianceGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: ["[\"public\"]"],
            isAdmin: false,
            isAuthenticated: false
          }
        },
        queryStringParameters: {
          activity: "Day Use",
          date: "2022-01-01",
          subAreaId: "0001"
        },
      },
      null
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(403);
    expect(response.body === "{ msg: 'Error: UnAuthenticated.' }");
  });

  test("Variance GET FAIL invalid params", async () => {
    jest.mock("/opt/permissionLayer", () => {
      return mockedSysadmin;
    });

    const varianceGET = require("../GET/index");
    const response = await varianceGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: ["[\"sysadmin\"]"],
            isAdmin: true,
            isAuthenticated: true
          }
        },
        queryStringParameters: {},
      },
      null
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(400);
    expect(response.body === "{ msg: 'Invalid request.' }");
  });

  test("Variance should trigger", async () => {
    const { calculateVariance } = require("/opt/baseLayer");
    const res = calculateVariance([8, 8, 8], 10, 0.2);
    expect(res).toEqual({
      averageHistoricValue: 8,
      varianceMessage: "Variance triggered: +25%",
      varianceTriggered: true,
      percentageChange: 0.25,
    });
  });

  test("Variance should trigger 2", async () => {
    const { calculateVariance } = require("/opt/baseLayer");
    const res = calculateVariance([8.5, 8.5, 8.5], 10.8, 0.2);
    expect(res).toEqual({
      averageHistoricValue: 8.5,
      varianceMessage: "Variance triggered: +27%",
      varianceTriggered: true,
      percentageChange: 0.27,
    });
  });

  test("Variance should trigger 3", async () => {
    const { calculateVariance } = require("/opt/baseLayer");
    const res = calculateVariance([8.5, 8.5, 8.5], 0.8, 0.2);
    expect(res).toEqual({
      averageHistoricValue: 8.5,
      varianceMessage: "Variance triggered: +91%",
      varianceTriggered: true,
      percentageChange: -0.91,
    });
  });

  test("Variance should not trigger", async () => {
    const { calculateVariance } = require("/opt/baseLayer");
    const res = calculateVariance([10.2, 10.2, 10.2], 10.2, 0.25);
    expect(res).toEqual({
      averageHistoricValue: 10.2,
      varianceMessage: "Variance triggered: -0%",
      varianceTriggered: false,
      percentageChange: 0,
    });
  });

  test("Variance should calculate variance with two years", async () => {
    const { calculateVariance } = require("/opt/baseLayer");
    const res = calculateVariance([8, 8, null], 10, 0.2);
    expect(res).toEqual({
      averageHistoricValue: 8,
      varianceMessage: "Variance triggered: +25%",
      varianceTriggered: true,
      percentageChange: 0.25,
    });
  });

  test("Variance PUT FAIL invalid params", async () => {
    jest.mock("/opt/permissionLayer", () => {
      return mockedSysadmin;
    });

    const variancePUT = require("../PUT/index");
    const response = await variancePUT.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: ["[\"sysadmin\"]"],
            isAdmin: true,
            isAuthenticated: true
          }
        }
      },
      null
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(400);
    expect(response.body === "{ msg: 'Invalid request.' }")
  });

  test("Variance PUT FAIL 403 public user", async () => {
    jest.mock("/opt/permissionLayer", () => {
      return mockedUnauthenticatedInvalidUser;
    });

    const variancePUT = require("../PUT/index");
    const response = await variancePUT.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: ["[\"public\"]"],
            isAdmin: false,
            isAuthenticated: false
          }
        }
      },
      null
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(403);
    expect(response.body === "{ msg: 'Error: UnAuthenticated.' }")
  });

  test("Variance PUT FAIL 403 limited user", async () => {
    jest.mock("/opt/permissionLayer", () => {
      return mockedLimitedUser;
    });

    const variancePUT = require("../PUT/index");
    const response = await variancePUT.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: ["[\"0041:0084\"]"],
            isAdmin: false,
            isAuthenticated: true
          }
        },
        body: JSON.stringify({
          subAreaId: "0403",
          orcs: "0001",
        })
      },
      null
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(403);
    expect(response.body === "{ msg: 'Error: Unauthorized.' }")
  });

  test("Variance PUT Success", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.post.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );

    jest.mock("/opt/permissionLayer", () => {
      return mockedSysadmin;
    });

    const variancePUT = require("../PUT/index");
    const response = await variancePUT.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: ["[\"sysadmin\"]"],
            isAdmin: true,
            isAuthenticated: true
          }
        },
        body: JSON.stringify({
          subAreaId: "0403",
          orcs: "0001",
          activity: "Day Use",
          date: "202201",
          fields: ["Some Field"],
          resolve: true,
          notes: "Some Note"
        }),
      },
      null
    );
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
  });
});
