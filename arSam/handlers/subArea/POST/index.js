const {
  dynamoClient,
  TransactWriteItemsCommand,
  incrementAndGetNextSubAreaID,
  getOne,
  logger,
  sendResponse
} = require("/opt/baseLayer");
const { createKeycloakRole } = require("/opt/keycloakLayer");
const { createPutFormulaConfigObj } = require("/opt/formulaLayer");
const {
  getValidSubareaObj,
  createUpdateParkWithNewSubAreaObj,
  createPutSubAreaObj,
} = require("/opt/subAreaLayer");
  
const SSO_ORIGIN = process.env.SSO_ORIGIN || 'https://dev.loginproxy.gov.bc.ca';
const SSO_CLIENT_ID = process.env.SSO_CLIENT_ID || 'default-client';

exports.handler = async (event, context) => {
  logger.debug('Subarea POST:', event);
  try {
    const permissionObject = event.requestContext.authorizer;
    permissionObject.roles = JSON.parse(permissionObject.roles);

    if (!permissionObject.isAuthenticated) {
      logger.info('**NOT AUTHENTICATED, PUBLIC**');
      return sendResponse(403, { msg: 'Unauthenticated.' }, context);
    }

    // Admins only
    if (!permissionObject.isAdmin) {
      logger.info('Not authorized.');
      return sendResponse(403, { msg: 'Unauthorized.' }, context);
    }

    const body = JSON.parse(event.body);

    // ensure all mandatory fields exist
    if (
      !body.orcs ||
      !body.activities ||
      !body.managementArea ||
      !body.section ||
      !body.region ||
      !body.bundle ||
      !body.subAreaName
    ) {
      return sendResponse(400, { msg: 'Invalid body' }, context);
    }

    // Get park
    const park = await getOne('park', body.orcs);
    if (!park) {
      logger.debug('Unable to find park', body.orcs);
      return sendResponse(400, { msg: 'Park not found' }, context);
    }

    // Generate subArea id
    const subAreaId = await incrementAndGetNextSubAreaID();

    // Create post obj
    let subAreaObj = getValidSubareaObj(body, park.parkName, subAreaId);

    // Create transaction
    let transactionObj = { TransactItems: [] };

    // Update park
    transactionObj.TransactItems.push({
      Update: createUpdateParkWithNewSubAreaObj(
        subAreaObj.subAreaName,
        subAreaId,
        subAreaObj.isLegacy,
        subAreaObj.orcs
      ),
    });

    // Create subArea
    transactionObj.TransactItems.push({
      Put: createPutSubAreaObj(subAreaObj, subAreaId, park.parkName),
    });

    // Create formula configs
    for (const formulaObj of createPutFormulaConfigObj(
      subAreaObj.activities,
      subAreaId,
      park.parkName,
      subAreaObj.orcs,
      subAreaObj.subAreaName
    )) {
      transactionObj.TransactItems.push({
        Put: formulaObj,
      });
    }

    const res = await dynamoClient.send(new TransactWriteItemsCommand(transactionObj));
    logger.debug('res:', res);

    // Add Keycloak role
    const kcRes = await createKeycloakRole(
      SSO_ORIGIN,
      SSO_CLIENT_ID,
      event.headers.Authorization.replace('Bearer ', ''),
      `${subAreaObj.orcs}:${subAreaId}`,
      `${park.parkName}:${subAreaObj.subAreaName}`
    );
    logger.debug('kcRes:', kcRes);

    return sendResponse(200, { msg: 'Subarea created', subArea: res }, context);
  } catch (err) {
    logger.error(err);
    return sendResponse(400, { msg: 'Invalid request' }, context);
  }
};
