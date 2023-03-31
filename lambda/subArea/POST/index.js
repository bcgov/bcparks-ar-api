const AWS = require("aws-sdk");
const {
  dynamodb,
  TABLE_NAME,
  incrementAndGetNextSubAreaID,
  getOne,
} = require("../../dynamoUtil");
const { createKeycloakRole } = require("../../keycloakUtil");
const { createFormulaConfigObj } = require("../../formulaUtils");
const { sendResponse } = require("../../responseUtil");
const { decodeJWT, resolvePermissions } = require("../../permissionUtil");
const { logger } = require("../../logger");
const { getValidSubareaObj } = require("../../subAreaUtils");

const SSO_URL = process.env.SSO_URL;
const SSO_CLIENT_ID = process.env.SSO_CLIENT_ID;

exports.handler = async (event, context) => {
  logger.debug("Subarea POST:", event);
  return await main(event, context);
};

async function main(event, context) {
  try {
    const token = await decodeJWT(event);
    const permissionObject = resolvePermissions(token);

    if (!permissionObject.isAuthenticated) {
      logger.info("**NOT AUTHENTICATED, PUBLIC**");
      return sendResponse(403, { msg: "Error: Unauthenticated." }, context);
    }

    // Admins only
    if (!permissionObject.isAdmin) {
      logger.info("Not authorized.");
      return sendResponse(403, { msg: "Unauthorized." }, context);
    }

    const body = JSON.parse(event.body);

    // ensure all madatory fields exist
    if (
      !body.orcs ||
      !body.activities ||
      !body.managementArea ||
      !body.section ||
      !body.region ||
      !body.bundle ||
      !body.subAreaName
    ) {
      return sendResponse(400, { msg: "Invalid body" }, context);
    }

    // Get park
    const park = await getOne("park", body.orcs);
    if (!park) {
      logger.debug("Unable to find park", body.orcs);
      return sendResponse(400, { msg: "Park not found" }, context);
    }

    // Remove bad fields
    let obj = getValidSubareaObj(body, park.parkName);

    // Add roles
    obj.roles = ["sysadmin", body.orcs];

    // Generate subArea id
    const subAreaId = await incrementAndGetNextSubAreaID();

    // Create transaction
    let transactionObj = { TransactItems: [] };

    //// Create entry obj for park
    const subAreaEntry = {
      name: obj.subAreaName,
      id: subAreaId,
      isLegacy: obj.isLegacy,
    };

    //// Create update park obj
    const updatePark = {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: "park" },
        sk: { S: obj.orcs },
      },
      ExpressionAttributeValues: {
        ":subAreas": {
          L: [{ M: AWS.DynamoDB.Converter.marshall(subAreaEntry) }],
        },
      },
      UpdateExpression: "SET subAreas = list_append(subAreas, :subAreas)",
    };
    transactionObj.TransactItems.push({
      Update: updatePark,
    });

    // Create subArea
    const putSubArea = {
      TableName: TABLE_NAME,
      ConditionExpression: "attribute_not_exists(sk)",
      Item: {
        pk: { S: `park::${obj.orcs}` },
        sk: { S: subAreaId },
        activities: { SS: obj.activities },
        managementArea: { S: obj.managementArea },
        section: { S: obj.section },
        region: { S: obj.region },
        bundle: { S: obj.bundle },
        subAreaName: { S: obj.subAreaName },
        parkName: { S: park.parkName },
        roles: { SS: park.roles },
        orcs: { S: obj.orcs },
      },
    };
    transactionObj.TransactItems.push({
      Put: putSubArea,
    });

    // Create formula configs
    const formulaObj = createFormulaConfigObj(
      obj.activities,
      subAreaId,
      park.parkName,
      obj.orcs,
      obj.subAreaName
    );
    const putFormula = {
      TableName: TABLE_NAME,
      ConditionExpression: "attribute_not_exists(sk)",
      Item: formulaObj,
    };
    transactionObj.TransactItems.push({
      Put: putFormula,
    });

    const res = await dynamodb.transactWriteItems(transactionObj).promise();
    logger.debug("res:", res);

    // Add Keycloak role
    const kcRes = await createKeycloakRole(
      SSO_URL,
      SSO_CLIENT_ID,
      event.headers.Authorization.replace("Bearer ", ""),
      `${obj.orcs}::${subAreaId}`,
      `${park.parkName}:${obj.subAreaName}`
    );
    logger.debug("kcRes:", kcRes);

    return sendResponse(200, { msg: "Subarea created", subArea: res }, context);
  } catch (err) {
    logger.error(err);
    return sendResponse(400, { msg: "Invalid request" }, context);
  }
}
