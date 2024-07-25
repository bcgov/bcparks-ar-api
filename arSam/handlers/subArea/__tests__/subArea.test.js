const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { REGION, ENDPOINT } = require("../../../__tests__/settings");
const { PARKSLIST } = require("../../../__tests__/mock_data.json");
const { getHashedText, deleteDB, createDB } = require("../../../__tests__/setup");
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const jwt = require("jsonwebtoken");
const tokenContent = {
  resource_access: { "attendance-and-revenue": { roles: ["sysadmin"] } },
};
const token = jwt.sign(tokenContent, "defaultSecret");


const testParkList = [];

async function setupDb(TABLE_NAME) {
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  for await (let park of PARKSLIST) {
    park.sk = park.sk;
    park.orcs = park.orcs;
    subAreaParkIdToDelete = park;

    let modifiedSubAreas = [];
    for await (let subArea of park.subAreas) {
      subArea.id = subArea.id;
      subAreaToDelete = subArea;
      modifiedSubAreas.push(subArea);

      // Add the sub area record
      // console.log("subarea record:", {
      //   pk: `park::${park.orcs}`,
      //   sk: `${subArea.id}`,
      //   activities: { SS : ['Day Use'] }
      // });
      let params1 = {
        TableName: TABLE_NAME,
        Item: {
          pk: {S: `park::${park.orcs}`},
          sk: {S: `${subArea.id}`},
          activities: { SS : ['Day Use'] }
        }
      };
      await dynamoClient.send(new PutItemCommand(params1))
      
      // Add the activity config
      let params2 = {
        TableName: TABLE_NAME,
        Item: marshall({
          pk: `config::${subArea.id}`,
          sk: `Day Use`
        })
      };
      await dynamoClient.send(new PutItemCommand(params2))

      // console.log("activity config", {
      //   pk: `config::${subArea.id}`,
      //   sk: `Day Use`
      // })

      // Add the activity record
      let params3 = {
        TableName: TABLE_NAME,
        Item: marshall({
          pk: `${subArea.id}::Day Use`,
          sk: `202201`
        })
      };
      await dynamoClient.send(new PutItemCommand(params3))

      // console.log("activity record", {
      //   pk: `${subArea.id}::Day Use`,
      //   sk: `202201`
      // })
    }
    park.subAreas = modifiedSubAreas;

    // Add the park record
    let params4 = {
      TableName: TABLE_NAME,
      Item: marshall(park),
    }
    await dynamoClient.send(new PutItemCommand(params4))

    testParkList.push(park);
  }
}

describe("Sub Area Test", () => {
  const mockKeycloakRoles = {
    createKeycloakRole: jest.fn().mockImplementation(() =>
      Promise.resolve({
        id: '123',
        name: 'test-role',
      })
    )
  };

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
    process.env.NAME_CACHE_TABLE_NAME = NAME_CACHE_TABLE_NAME
    process.env.CONFIG_TABLE_NAME= CONFIG_TABLE_NAME
    process.env.TABLE_NAME = TABLE_NAME
    await createDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    await setupDb(TABLE_NAME);
  }, 20000);

  afterEach(() => {
    deleteDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    process.env = OLD_ENV; // Restore old environment
  });

  test("Handler - 200 Sub Area POST Success", async () => {
    jest.mock('/opt/keycloakLayer', () => {
      return mockKeycloakRoles
    });

    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });

    let params = {
        TableName: CONFIG_TABLE_NAME,
        Key: marshall({
          pk: "subAreaID",
        }),
      }
    const config = await dynamoClient.send(new GetItemCommand(params));

    const lastID = config.Item === undefined ? 0 : config.Item.lastID;

    // TODO: need to unmarshall?

    const subAreaPOST = require("../POST/index");
    const response = await subAreaPOST.handler(
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
          activities: ["Day Use"],
          orcs: "0041",
          managementArea: "South Fraser",
          section: "South Coast",
          region: "South Coast",
          bundle: "South Fraser",
          subAreaName: "Clear Creek",
        }),
      },
      null
    );
    expect(response.statusCode).toBe(200);

    let configParams2 = {
      TableName: CONFIG_TABLE_NAME,
      Key: marshall({
        pk: "subAreaID",
      }),
    };
    const config2Res = await dynamoClient.send(new GetItemCommand(configParams2))
    const config2 = unmarshall(config2Res.Item);
    // check for incremented subAreaID
    expect(config2.lastID).toBeGreaterThan(lastID);
  });

  test("Handler - 403 Sub Area POST Unauthenticated", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.post.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );

    const subAreaPOST = require("../POST/index");
    const response = await subAreaPOST.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: "[\"public\"]",
            isAdmin: false,
            isAuthenticated: false,
          },
        },
        body: JSON.stringify({
          activities: ["Day Use"],
          orcs: "0041",
          managementArea: "South Fraser",
          section: "South Coast",
          region: "South Coast",
          bundle: "South Fraser",
          subAreaName: "Clear Creek",
        }),
      },
      null
    );
    expect(response.statusCode).toBe(403);
  });

  test("Handler - 403 Sub Area POST Unauthenticated Invalid User", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.post.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );

    const subAreaPOST = require("../POST/index");
    const response = await subAreaPOST.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: "[\"public\"]",
            isAdmin: false,
            isAuthenticated: false,
          },
        },
        body: JSON.stringify({
          activities: ["Day Use"],
          orcs: "0041",
          managementArea: "South Fraser",
          section: "South Coast",
          region: "South Coast",
          bundle: "South Fraser",
          subAreaName: "Clear Creek",
        }),
      },
      null
    );
    expect(response.statusCode).toBe(403);
  });

  test("Handler - 403 Sub Area POST Unauthenticated", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.post.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );

    const subAreaPOST = require("../POST/index");
    const response = await subAreaPOST.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: "[\"public\"]",
            isAdmin: false,
            isAuthenticated: false,
          },
        },
        body: JSON.stringify({
          activities: ["Day Use"],
          orcs: "0041",
          managementArea: "South Fraser",
          section: "South Coast",
          region: "South Coast",
          bundle: "South Fraser",
          subAreaName: "Clear Creek",
        }),
      },
      null
    );
    expect(response.statusCode).toBe(403);
    expect(response.body).toBe('{"msg":"Unauthenticated."}');
  });

  test("Handler - 403 Sub Area POST Not Admin", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.post.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );

    const subAreaPOST = require("../POST/index");
    const response = await subAreaPOST.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
            roles: "[\"0041:0084\"]",
            isAdmin: false,
            isAuthenticated: true,
          },
        },
        body: JSON.stringify({
          activities: ["Day Use"],
          orcs: "0041",
          managementArea: "South Fraser",
          section: "South Coast",
          region: "South Coast",
          bundle: "South Fraser",
          subAreaName: "Clear Creek",
        }),
      },
      null
    );
    expect(response.statusCode).toBe(403);
    expect(response.body).toBe('{"msg":"Unauthorized."}');
  });

  test("Handler - 400 Sub Area POST Invalid body", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.post.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );
    const subAreaPOST = require("../POST/index");
    const response = await subAreaPOST.handler(
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
          activities: ["Day Use"],
          managementArea: "South Fraser",
          section: "South Coast",
          region: "South Coast",
          bundle: "South Fraser",
          subAreaName: "Clear Creek",
        }),
      },
      null
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('{"msg":"Invalid body"}');
  });

  test("Handler - 400 Sub Area POST Park Not Found", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.post.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );
    const subAreaPOST = require("../POST/index");
    const response = await subAreaPOST.handler(
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
          activities: ["Day Use"],
          orcs: "fakeOrc",
          managementArea: "South Fraser",
          section: "South Coast",
          region: "South Coast",
          bundle: "South Fraser",
          subAreaName: "Clear Creek",
        }),
      },
      null
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('{"msg":"Invalid request"}');
  });

  test("Handler - 400 Sub Area DELETE Bad Request", async () => {
    // Returns if there are no query string parameters
    const subAreaDELETE = require("../DELETE/index");
    const response = await subAreaDELETE.handler(
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
        }
    });
    expect(response.statusCode).toBe(400);
  });

  test("Handler - 403 Sub Area DELETE Not Admin", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.delete.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );

    jest.mock("/opt/permissionLayer", () => {
      return {
        requirePermissions: () => {
          throw {
            statusCode: 403,
            msg: "Not authorized."
          }
        }
      };
    });
    const subAreaDELETE = require("../DELETE/index");
    const response = await subAreaDELETE.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        queryStringParameters: {
          orcs: "0041",
          archive: "false",
          subAreaId: "fakeSubAreaId"
        },
      },
      null
    );
    expect(response.statusCode).toBe(403);
    expect(response.body).toBe("\"Not authorized.\"");
  });

  test("Handler - 403 Sub Area DELETE Unauthenticated", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.delete.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );

    jest.mock("/opt/permissionLayer", () => {
      return {
        requirePermissions: () =>  {
          throw {
            statusCode: 403,
            msg: "Unauthenticated."
          }
        }
      };
    });
    const subAreaDELETE = require("../DELETE/index");
    const response = await subAreaDELETE.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        queryStringParameters: {
          orcs: "0041",
          archive: "false",
          subAreaId: "fakeSubAreaId"
        },
      },
      null
    );
    expect(response.statusCode).toBe(403);
    expect(response.body).toBe("\"Unauthenticated.\"");
  });

  test("Handler - 404 Sub Area soft DELETE not found", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.delete.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );

    jest.mock("/opt/permissionLayer", () => {
      return {
        requirePermissions: () => {
          return {
            isAdmin: true,
            isSysadmin: true,
          };
        },
      };
    });
    const subAreaDELETE = require("../DELETE/index");
    const response = await subAreaDELETE.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        queryStringParameters: {
          orcs: "0041",
          archive: "true",
          subAreaId: "fakeSubAreaId"
        },
      },
      null
    );
    expect(response.statusCode).toBe(404);
    expect(response.body).toBe("{\"msg\":\"SubAreaId fakeSubAreaId not found\"}");
  });

  test("Handler - 200 Sub Area soft DELETE success", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.delete.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );

    jest.mock("/opt/permissionLayer", () => {
      return {
        requirePermissions: () => {
          return {
            isAdmin: true,
            isSysadmin: true,
          };
        },
      };
    });
    const subAreaDELETE = require("../DELETE/index");
    const parkObject = PARKSLIST[1];
    const qsp = {
      orcs: parkObject.orcs,
      archive: "true",
      subAreaId: parkObject.subAreas[0].id
    };
    const response = await subAreaDELETE.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        queryStringParameters: qsp,
      },
      null
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("{\"msg\":\"SubArea archived\"}");
  });

  test("Handler - 200 Sub Area hard DELETE Success", async () => {
    const axios = require("axios");
    jest.mock("axios");
    axios.delete.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, data: {} })
    );

    jest.mock("/opt/permissionLayer", () => {
      return {
        requirePermissions: () => {
          return {
            isAdmin: true,
            isSysadmin: true,
          };
        },
      };
    });
    const subAreaDELETE = require("../DELETE/index");

    // Delete the first subarea from PARKSLIST
    const parkObject = PARKSLIST[0]; //add activities 
    const qsp = {
      orcs: parkObject.orcs,
      archive: "false",
      subAreaId: parkObject.subAreas[0].id
    };
    const response = await subAreaDELETE.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        queryStringParameters: qsp,
      },
      null
    );
    expect(response.statusCode).toBe(200);
  });
});
