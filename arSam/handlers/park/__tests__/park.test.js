const AWS = require("aws-sdk");
const { DocumentClient } = require("aws-sdk/clients/dynamodb");
const { REGION, ENDPOINT, TABLE_NAME } = require("../../../__tests__/settings");
const { PARKSLIST, SUBAREAS } = require("../../../__tests__/mock_data.json");

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

  for (const park of PARKSLIST) {
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: park,
      })
      .promise();
  }

  for (const subarea of SUBAREAS) {
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: subarea,
      })
      .promise();
  }
}

describe("Park Test", () => {
  const mockedLimitedUser = {
    roleFilter: jest.fn((records, roles) => {
      if (roles.includes('0041:0087')) {
        return records.filter((subarea) => subarea.roles.includes('0041:0087'));
      }
      return records.filter((park) => park.orcs === "0041");
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

  test("Handler - 200 Received list of parks", async () => {
    const event = {
      headers: {
        Authorization: "Bearer " + token,
      },
      httpMethod: "GET",
      requestContext: {
        authorizer: {
          roles: "[\"sysadmin\"]",
          isAdmin: true,
          isAuthenticated: true,
        },
      },
    };
    // Ignore legacy parks for now.
    let modifiedParksList = [...PARKSLIST];
    for (const [index, park] of modifiedParksList.entries()) {
      if (park.hasOwnProperty("isLegacy")) {
        modifiedParksList.splice(index, 1);
      }
    }
    const parkGET = require("../GET/index");
    const response = await parkGET.handler(event, null);
    expect(response.statusCode).toBe(200);
  });

  test("Handler - 200 Receive list of parks with limited role", async () => {
    let specificSubAreas = [];
    for (const area of SUBAREAS) {
      if (area.pk === "park::0041") {
        specificSubAreas.push(area);
      }
    }
    jest.mock("/opt/permissionLayer", () => {
      return mockedLimitedUser;
    });
    const parkGET = require("../GET/index");
    const response = await parkGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        httpMethod: "GET",
        requestContext: {
          authorizer: {
            roles: "[\"0041:0087\"]",
            isAdmin: false,
            isAuthenticated: true,
          },
        },
      },
      null
    );

    const body = JSON.parse(response.body);
    // Body should have 1 subarea
    expect(body).toMatchObject([
      {
        orcs: "0041",
        parkName: "Cultus Lake Park",
        pk: "park",
        sk: "0041",
        subAreas: [{
          id: '0087',
          name: 'Maple Bay',
        }
        ],
      },
    ]);
  });

  test("Handler - 200 Receive park specific information", async () => {
    let specificSubAreas = [];
    for (const area of SUBAREAS) {
      if (area.pk === "park::0041") {
        specificSubAreas.push(area);
      }
    }
    const parkGET = require("../GET/index");
    const response = await parkGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        httpMethod: "GET",
        requestContext: {
          authorizer: {
            roles: "[\"sysadmin\"]",
            isAdmin: true,
            isAuthenticated: true,
          },
        },
        queryStringParameters: {
          orcs: PARKSLIST[0].sk,
          subAreaId: specificSubAreas[0].sk,
        },
      },
      null
    );

    const body = JSON.parse(response.body);
    expect(body[0].subAreaName).toMatch(specificSubAreas[0].subAreaName);
    expect(response.statusCode).toBe(200);
  });

  test("Handler - 200 Receive park specific information with limited role", async () => {
    let specificSubAreas = [];
    for (const area of SUBAREAS) {
      if (area.pk === "park::0041") {
        specificSubAreas.push(area);
      }
    }
    jest.mock("/opt/permissionLayer", () => {
      return mockedLimitedUser;
    });
    const parkGET = require("../GET/index");
    const response = await parkGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        httpMethod: "GET",
        requestContext: {
          authorizer: {
            roles: "[\"0041:0087\"]",
            isAdmin: false,
            isAuthenticated: true,
          },
        },
        queryStringParameters: {
          orcs: PARKSLIST[0].sk,
          subAreaId: specificSubAreas[0].sk,
        },
      },
      null
    );
    const body = JSON.parse(response.body);
    expect(body[0].sk).toMatch(specificSubAreas[0].sk);
    expect(response.statusCode).toBe(200);
  });

  test("Handler - 403 GET Invalid", async () => {
    const parkGET = require("../GET/index");
    const response = await parkGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token + "invalid",
        },
        requestContext: {
          authorizer: {
            roles: "[\"public\"]",
            isAdmin: false,
            isAuthenticated: false,
          },
        },
      },
      null
    );
    expect(response.statusCode).toBe(403);
    expect(response.body).toBe('{"msg":"Error: UnAuthenticated."}');
  });

  test("Handler - 400 GET Bad Request", async () => {
    const parkGET = require("../GET/index");
    const response = await parkGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token + "invalid",
        },
        requestContext: {
          authorizer: {
            roles: "[\"sysadmin\"]",
            isAdmin: true,
            isAuthenticated: true,
          },
        },
        queryStringParameters: {
          badParam: "oops",
        },
      },
      null
    );

    expect(response.statusCode).toBe(400);
  });

  test("Handler - 400 POST Bad Request", async () => {
    const parkPOST = require("../POST/index");
    const response = await parkPOST.handler(
      {
        headers: {
          Authorization: "Bearer " + token + "invalid",
        },
        requestContext: {
          authorizer: {
            roles: "[\"sysadmin\"]",
            isAdmin: true,
            isAuthenticated: true,
          },
        },
        body: JSON.stringify({
          badParam: "{xxxxxx}",
        }),
      },
      null
    );

    expect(response.statusCode).toBe(400);
  });

  test("Handler - 400 POST Park", async () => {
    const parkPOST = require("../POST/index");
    const response = await parkPOST.handler(
      {
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
        body: JSON.stringify({
          orcs: "0000",
          someconfig: "test",
        }),
      },
      null
    );

    expect(response.statusCode).toBe(400);
  });

  test("Handler - 200 POST Park", async () => {
    const parkPOST = require("../POST/index");
    const response = await parkPOST.handler(
      {
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
        body: JSON.stringify({
          orcs: "0000",
          parkName: "test",
          isLegacy: "false"
        }),
      },
      null
    );
    expect(response.statusCode).toBe(200);
  });

  test("Handler - 403 POST Park Invalid User", async () => {
    const parkPOST = require("../POST/index");
    const response = await parkPOST.handler(
      {
        headers: {
          Authorization: "Bearer " + token + "invalid",
        },
        requestContext: {
          authorizer: {
            roles: "[\"public\"]",
            isAdmin: false,
            isAuthenticated: false,
          },
        },
      },
      null
    );

    expect(response.statusCode).toBe(403);
  });

  test("Handler - 403 POST Park Unauthorized User", async () => {
    const parkPOST = require("../POST/index");
    const response = await parkPOST.handler(
      {
        headers: {
          Authorization: "Bearer " + token + "invalid",
        },
        requestContext: {
          authorizer: {
            roles: "[]",
            isAdmin: false,
            isAuthenticated: false,
          },
        },
      },
      null
    );

    expect(response.statusCode).toBe(403);
  });
});
