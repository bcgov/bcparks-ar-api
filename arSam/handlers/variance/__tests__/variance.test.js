const AWS = require("aws-sdk");
const { DocumentClient } = require("aws-sdk/clients/dynamodb");
const {
  REGION,
  ENDPOINT,
  TABLE_NAME
} = require("../../../__tests__/settings");

const jwt = require("jsonwebtoken");
const tokenContent = {
  resource_access: { "attendance-and-revenue": { roles: ["sysadmin"] } },
};
const token = jwt.sign(tokenContent, "defaultSecret");

async function setupDb() {
  new AWS.DynamoDB({
    region: REGION,
    endpoint: ENDPOINT,
  });
  docClient = new DocumentClient({
    region: REGION,
    endpoint: ENDPOINT,
    convertEmptyValues: true,
  });

  await docClient
    .put({
      TableName: TABLE_NAME,
      Item: {
        pk: `variance::0001::202201`,
        sk: `0403::Day Use`,
        fields: docClient.createSet(["peopleAndVehiclesVehicle"]),
        notes: "A Note",
        resolved: false,
      },
    })
    .promise();

  await docClient
    .put({
      TableName: TABLE_NAME,
      Item: {
        pk: `variance::0001::202201`,
        sk: `0403::Frontcountry Camping`,
        fields: docClient.createSet(["peopleAndVehiclesVehicle"]),
        notes: "A different note",
        resolved: false,
      },
    })
    .promise();

  await docClient
    .put({
      TableName: TABLE_NAME,
      Item: {
        pk: `variance::0001::202202`,
        sk: `0403::Day Use`,
        fields: docClient.createSet(["peopleAndVehiclesVehicle"]),
        notes: "A Note",
        resolved: false,
      },
    })
    .promise();
}

describe("Variance Test", () => {
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
