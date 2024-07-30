const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { REGION, ENDPOINT } = require("../../../__tests__/settings");
const { PARKSLIST, SUBAREAS, SUBAREA_ENTRIES } = require("../../../__tests__/mock_data.json");
const { getHashedText, deleteDB, createDB } = require("../../../__tests__/setup");
const { marshall } = require('@aws-sdk/util-dynamodb');

async function setupDb(TABLE_NAME) {
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  for (const park of PARKSLIST) {
    let params = {
      TableName: TABLE_NAME,
      Item: marshall(park),
    }  
    await dynamoClient.send(new PutItemCommand(params))
  }

  for (const subarea of SUBAREAS) {
    let params = {
      TableName: TABLE_NAME,
      Item: marshall(subarea),
    }  
    await dynamoClient.send(new PutItemCommand(params))
  }

  for (const subEntry of SUBAREA_ENTRIES) {
    let params = {
      TableName: TABLE_NAME,
      Item: marshall(subEntry),
    }  
    await dynamoClient.send(new PutItemCommand(params))
  }
}

describe("Pass Succeeds", () => {
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
    process.env.CONFIG_TABLE_NAME = CONFIG_TABLE_NAME;
    await createDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    await setupDb(TABLE_NAME);
  });

  afterEach(() => {
    deleteDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    process.env = OLD_ENV; // Restore old environment
  });

  test("dynamoUtil - runScan", async () => {
    const utils = require("../baseLayer");

    let queryObj = {
      TableName: TABLE_NAME,
    };
    queryObj.FilterExpression = "pk = :pk";
    queryObj.ExpressionAttributeValues = {};
    queryObj.ExpressionAttributeValues[":pk"] = { S: `park` };

    const result = await utils.runScan(queryObj, null);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parkName: PARKSLIST[0].parkName,
        }),
        expect.objectContaining({
          parkName: PARKSLIST[1].parkName,
        }),
      ])
    );
  });

  test("dynamoUtil - getParks", async () => {
    const utils = require("../baseLayer");

    const result = await utils.getParks();

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parkName: PARKSLIST[0].parkName,
        }),
        expect.objectContaining({
          parkName: PARKSLIST[1].parkName,
        }),
      ])
    );
  });

  test("dynamoUtil - getSubAreas", async () => {
    const utils = require("../baseLayer");

    let orc = "0041";
    let specificSubAreas = [];
    for (const area of SUBAREAS) {
      if (area.pk === `park::${orc}`) {
        specificSubAreas.push(area);
      }
    }
    const result = await utils.getSubAreas(orc);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subAreaName: specificSubAreas[0].subAreaName,
        }),
        expect.objectContaining({
          subAreaName: specificSubAreas[1].subAreaName,
        }),
      ])
    );
  });

  test("dynamoUtil - getRecords", async () => {
    const utils = require("../baseLayer");

    const result = await utils.getRecords(SUBAREAS[0]);

    expect(result).toEqual(
      expect.not.arrayContaining([
        expect.not.objectContaining({
          orcs: SUBAREAS[0].pk.split("::")[1],
        }),
      ])
    );
  });

  test("dynamoUtil - incrementAndGetNextSubAreaID works with and without an entry in the DB", async () => {
    const utils = require("../baseLayer");

    const result = await utils.incrementAndGetNextSubAreaID();
    expect(result).toEqual("1");

    const result2 = await utils.incrementAndGetNextSubAreaID();
    expect(result2).toEqual("2");
  });
});
