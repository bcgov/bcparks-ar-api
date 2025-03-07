
const { runQuery, TABLE_NAME, sendResponse, logger } = require("/opt/baseLayer");
const { roleFilter } = require("/opt/permissionLayer");

exports.handler = async (event, context) => {
  logger.info("GET: Region");

  // Allow CORS
  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, context);
  }

  let regionId = event?.queryStringParameters?.regionId || null;

  try {
    let permissionObject = event?.requestContext?.authorizer;
    permissionObject.roles = JSON.parse(permissionObject?.roles);
    permissionObject.isAdmin = JSON.parse(permissionObject?.isAdmin || false);
    permissionObject.isAuthenticated = JSON.parse(permissionObject?.isAuthenticated || false);

    if (!permissionObject.isAuthenticated) {
      logger.info("**NOT AUTHENTICATED, PUBLIC**");
      return sendResponse(403, { msg: "Error: UnAuthenticated." }, context);
    }

    let response = {};

    if (regionId) {
      // Get a specific region, and build the subsequent section and management area hierarchy.
      // Can break this out later into their own endpoints if needed, but for the purposes of AR-427, we'll just do it all here.

      // Get region
      let regionQuery = {
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk AND sk = :sk",
        ExpressionAttributeValues: {
          ":pk": { S: "region" },
          ":sk": { S: regionId },
        },
      };

      let regionData = await runQuery(regionQuery, true);
      response = regionData.data[0];

      // Get sections
      let sectionQuery = {
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": { S: `section::${regionId}` },
        },
      };

      let sectionData = await runQuery(sectionQuery, true);
      response["sections"] = sectionData.data;

      // Get management areas
      for (const section of response?.sections) {
        let managementAreaQuery = {
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: {
            ":pk": { S: `managementArea::${regionId}::${section.sk}` },
          },
        };

        let managementAreaData = await runQuery(managementAreaQuery, true);
        // find the section in the response object and add the management areas
        let sectionIndex = response.sections.indexOf(section);
        response.sections[sectionIndex]["managementAreas"] = managementAreaData.data;
      }
    } else {
      // Get a list of regions
      let regionQuery = {
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": { S: "region" },
        },
      };

      let regionData = await runQuery(regionQuery, true);
      response = regionData.data;
    }
    return sendResponse(200, response, context);
  } catch (error) {
    return sendResponse(500, { msg: "Error: Internal Server Error." }, context);
  }
};