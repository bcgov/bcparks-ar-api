const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const { REGION, ENDPOINT } = require("../../../__tests__/settings");
const {
  PARKSLIST,
  SUBAREAS,
  CONFIG_ENTRIES,
  SUBAREA_ENTRIES,
  FISCAL_YEAR_LOCKS,
} = require("../../../__tests__/mock_data.json");

const { getHashedText, deleteDB, createDB } = require("../../../__tests__/setup");
const jwt = require("jsonwebtoken");
const token = jwt.sign(
  { resource_access: { "attendance-and-revenue": { roles: ["sysadmin"] } } },
  "defaultSecret"
);
const emptyRole = {
  resource_access: { "attendance-and-revenue": { roles: [""] } },
};

async function setupDb(tableName) {

  for (const item of PARKSLIST) {
    await genericPutDocument(item, tableName);
  }
  for (const item of SUBAREAS) {
    await genericPutDocument(item, tableName);
  }
  for (const item of SUBAREA_ENTRIES) {
    await genericPutDocument(item, tableName);
  }
  for (const item of CONFIG_ENTRIES) {
    await genericPutDocument(item, tableName);
  }
  for (const item of FISCAL_YEAR_LOCKS) {
    await genericPutDocument(item, tableName);
  }
}

async function genericPutDocument(item, TABLE_NAME) {

  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  const input = {
    Item: marshall(item),
    TableName: TABLE_NAME,
  };
  const command = new PutItemCommand(input);
  return await dynamoClient.send(command);
}

describe("Activity Test", () => {
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

  test("Handler - 200 GET specific activity entry", async () => {
    const activityGET = require("../GET/index");
    const obj = await activityGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        queryStringParameters: {
          orcs: SUBAREA_ENTRIES[0].orcs,
          subAreaId: SUBAREA_ENTRIES[0].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[0].pk.split("::")[1],
          date: SUBAREA_ENTRIES[0].sk,
        },
      },
      null
    );
    expect(JSON.parse(obj.body)).toMatchObject(SUBAREA_ENTRIES[0]);
  });

  test("Handler - 403 GET Not Authenticated", async () => {
    const activityGET = require("../GET/index");
    const response = await activityGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"public\"]",
                isAdmin: false,
                isAuthenticated: false,
            }
        },
        queryStringParameters: {
          orcs: SUBAREA_ENTRIES[0].orcs,
          subAreaId: SUBAREA_ENTRIES[0].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[0].pk.split("::")[1],
          date: SUBAREA_ENTRIES[0].sk,
        },
      },
      null
    );

    expect(response.statusCode).toBe(403);
  });

  test("Handler - 403 GET Unauthorized role", async () => {
    const activityGET = require("../GET/index");
    const response = await activityGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
          PsuedoToken: emptyRole,
        },
        requestContext: {
            authorizer: {
                roles: "[]",
                isAdmin: false,
                isAuthenticated: false,
              },
        },
        queryStringParameters: {
          orcs: SUBAREA_ENTRIES[0].orcs,
          subAreaId: SUBAREA_ENTRIES[0].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[0].pk.split("::")[1],
          date: SUBAREA_ENTRIES[0].sk,
        },
      },
      null
    );

    expect(response.statusCode).toBe(403);
  });

  test("Subarea Handler - 400 GET Bad Request", async () => {
    const activityGET = require("../GET/index");
    const response = await activityGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        queryStringParameters: {
          badParam: "oops",
        },
      },
      null
    );

    expect(response.statusCode).toBe(400);
  });

  test("HandlePost - 200 POST handle Activity/Variances", async () => {
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });
    const activityPOST = require("../POST/index");
    // Setup the first record
    const response = await activityPOST.handlePost(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        body: JSON.stringify({
          orcs: SUBAREA_ENTRIES[0].orcs,
          parkName: SUBAREA_ENTRIES[0].parkName,
          subAreaId: SUBAREA_ENTRIES[0].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[0].pk.split("::")[1],
          date: "202201",
          peopleAndVehiclesTrail: 3,
          picnicRevenueGross: 50,
          peopleAndVehiclesVehicle: 5,
          peopleAndVehiclesBus: 5,
          picnicRevenueShelter: 5,
          picnicShelterPeople: 5,
          otherDayUsePeopleHotSprings: 5,
          otherDayUseRevenueHotSprings: 5,
          subAreaName: "TBD"
        }),
      },
      null
    );
    expect(response.statusCode).toBe(200);

    // Expect no variance to be created
    const input = {
      Key: {
        pk: marshall(`variance::${SUBAREA_ENTRIES[0].orcs}::202201`),
        sk: marshall(`${SUBAREA_ENTRIES[0].pk.split("::")[0]}::${SUBAREA_ENTRIES[0].pk.split("::")[1]}`)
      },
      TableName: TABLE_NAME,
    };
    const command = new GetItemCommand(input);
    const doc = await dynamoClient.send(command);
    expect(doc?.Item).toBe(undefined);



    // Change year and create a new record
    const secondResponse = await activityPOST.handlePost(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        body: JSON.stringify({
          orcs: SUBAREA_ENTRIES[0].orcs,
          parkName: SUBAREA_ENTRIES[0].parkName,
          subAreaId: SUBAREA_ENTRIES[0].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[0].pk.split("::")[1],
          date: "202301",
          peopleAndVehiclesTrail: 3,
          picnicRevenueGross: 5005,
          peopleAndVehiclesVehicle: 5,
          peopleAndVehiclesBus: 5,
          picnicRevenueShelter: 5,
          picnicShelterPeople: 5,
          otherDayUsePeopleHotSprings: 5,
          otherDayUseRevenueHotSprings: 5,
          subAreaName: "TBD"
        }),
      },
      null
    );
    expect(secondResponse.statusCode).toBe(200);

    // Expect variance to be created
    const input2 = {
      Key: {
        pk: marshall(`variance::${SUBAREA_ENTRIES[0].orcs}::202301`),
        sk: marshall(`${SUBAREA_ENTRIES[0].pk.split("::")[0]}::${SUBAREA_ENTRIES[0].pk.split("::")[1]}`)
      },
      TableName: TABLE_NAME,
    };
    const command2 = new GetItemCommand(input2);
    const doc2 = await dynamoClient.send(command2);
    expect(unmarshall(doc2?.Item)).toEqual({
      parkName: 'Cultus Lake Park',
      orcs: '0041',
      sk: '0087::Day Use',
      pk: 'variance::0041::202301',
      fields: [{
        key: 'picnicRevenueGross',
        percentageChange: 99.1,
        historicalAverage: 50,
        yearlyAverages: {
          '2022': 50
        }
      }],
      resolved: false,
      subAreaId: '0087',
      roles: ['sysadmin', '0041:0087'],
      subAreaName: 'TBD',
      bundle: 'N/A'
    });
  });

  test("Handler - 403 POST Not Authenticated", async () => {
    const activityPOST = require("../POST/index");
    const response = await activityPOST.handlePost(
      {
        headers: {
          Authorization: "Bearer " + token,
          PsuedoToken: "error", //{ resource_access: { 'attendance-and-revenue': { roles: [''] } } }
        },
        requestContext: {
            authorizer: {
                roles: "[\"public\"]",
                isAdmin: false,
                isAuthenticated: false,
            }
        },
        body: JSON.stringify({
          orcs: SUBAREA_ENTRIES[0].orcs,
          subAreaId: SUBAREA_ENTRIES[0].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[0].pk.split("::")[1],
          date: "202201",
        }),
      },
      null
    );

    expect(response.statusCode).toBe(403);
  });

  test("Handler - 403 POST Unauthorized role", async () => {
    const activityPOST = require("../POST/index");
    const response = await activityPOST.handlePost(
      {
        headers: {
          Authorization: "Bearer " + token,
          PsuedoToken: emptyRole,
        },
        requestContext: {
            authorizer: {
                roles: "[\"public\"]",
                isAdmin: false,
                isAuthenticated: false,
            }
        },
        body: JSON.stringify({
          orcs: SUBAREA_ENTRIES[0].orcs,
          subAreaId: SUBAREA_ENTRIES[0].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[0].pk.split("::")[1],
          date: "202201",
        }),
      },
      null
    );

    expect(response.statusCode).toBe(403);
  });

  // note: CONFIG POST disabled 2022-09-27

  test("HandlePost - 400 POST handle Activity", async () => {
    const activityPOST = require("../POST/index");
    const response = await activityPOST.handlePost(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        body: JSON.stringify({
          orcs: SUBAREA_ENTRIES[0].orcs,
        }),
      },
      null
    );
    expect(response.statusCode).toBe(400);
  });

  test("HandlePost - 400 POST handle Activity", async () => {
    const activityPOST = require("../POST/index");
    const response = await activityPOST.handlePost(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
      },
      null
    );
    expect(response.statusCode).toBe(400);
  });

  test("HandlePost - 400 POST handle Activity date", async () => {
    const activityPOST = require("../POST/index");
    const response = await activityPOST.handlePost(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        body: JSON.stringify({
          orcs: SUBAREA_ENTRIES[0].orcs,
          subAreaId: SUBAREA_ENTRIES[0].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[0].pk.split("::")[1],
          date: "2022", // Invalid
        }),
      },
      null
    );
    expect(response.statusCode).toBe(400);
  });

  test("HandlePost - 400 POST Bad Request", async () => {
    const activityPOST = require("../POST/index");
    const response = await activityPOST.handlePost(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        body: {
          badParam: "{xxxxxx}",
        },
      },
      null
    );
    expect(response.statusCode).toBe(400);
  });

  test("HandleLock/PostToLocked/Unlock - 200-409-200", async () => {
    const activityPOST = require("../POST/index");
    const response = await activityPOST.handleLock(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        body: JSON.stringify({
          orcs: SUBAREA_ENTRIES[3].orcs,
          subAreaId: SUBAREA_ENTRIES[3].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[3].pk.split("::")[1],
          date: "201901",
        }),
      },
      null
    );
    expect(response.statusCode).toBe(200);

    const response2 = await activityPOST.handlePost(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        body: JSON.stringify({
          orcs: SUBAREA_ENTRIES[3].orcs,
          subAreaId: SUBAREA_ENTRIES[3].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[3].pk.split("::")[1],
          date: "201901", // should be locked as per previous test
        }),
      },
      null
    );
    expect(response2.statusCode).toBe(409);


    const response3 = await activityPOST.handleUnlock(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        body: JSON.stringify({
          orcs: SUBAREA_ENTRIES[3].orcs,
          subAreaId: SUBAREA_ENTRIES[3].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[3].pk.split("::")[1],
          date: "201901",
        }),
      },
      null
    );
    expect(response3.statusCode).toBe(200);
  });

  test("Handler - 403 POST to locked fiscal year", async () => {
    const activityPOST = require("../POST/index");
    const response = await activityPOST.handlePost(
      {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
            authorizer: {
                roles: "[\"sysadmin\"]",
                isAdmin: true,
                isAuthenticated: true,
            }
        },
        body: JSON.stringify({
          orcs: SUBAREA_ENTRIES[2].orcs,
          subAreaId: SUBAREA_ENTRIES[2].pk.split("::")[0],
          activity: SUBAREA_ENTRIES[2].pk.split("::")[1],
          date: "201801", // Fiscal year is locked
        }),
      },
      null
    );
    expect(response.statusCode).toBe(403);
  });
});
