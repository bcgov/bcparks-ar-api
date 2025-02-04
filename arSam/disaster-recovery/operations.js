const {
  checkTableExists,
  checkBackupExistsInDynamo,
  checkPitrEnabled,
  checkDeletionProtectionEnabled
} = require('./functions');

/**
 * All operation types (eg. delete, restore, backup) run during any of the recovery
 * processes. Each operation contains the settings for that specified operation.
 *
 */
const operations = {
  duplicate: {
    operationName: 'Duplicate',
    args: [],
    check: checkTableExists,
    dateTimeInputISO: null,
    errorMessage: null,
    expectFromCheck: true,
    message: null,
    response: null,
    sourceTable: null,
    targetTable: null
  },
  backupDynamoOG: {
    operationName: 'Backup as Dynamo Original',
    args: [],
    backupName: null,
    check: checkBackupExistsInDynamo,
    expectFromCheck: true,
    errorMessage: null,
    message: null,
    response: null,
    sourceTable: null
  },
  backupDynamoDupe: {
    operationName: 'Backup as Dynamo Duplicate',
    args: [],
    backupName: null,
    check: checkBackupExistsInDynamo,
    errorMessage: null,
    expectFromCheck: true,
    message: null,
    response: null,
    sourceTable: null
  },
  deleteOG: {
    operationName: 'Delete',
    args: [],
    check: checkTableExists,
    errorMessage: null,
    expectFromCheck: false,
    message: null,
    response: null,
    sourceTable: null
  },
  restoreDynamo: {
    operationName: 'Restore from Dynamo',
    args: [],
    backupName: null,
    check: checkTableExists,
    message: null,
    errorMessage: null,
    expectFromCheck: true,
    response: null,
    targetTable: null
  },
  restoreAWS: {
    operationName: 'Restore from AWS',
    args: [],
    backupObj: null,
    check: checkTableExists,
    message: null,
    errorMessage: null,
    expectFromCheck: true,
    response: null,
    targetTable: null
  },
  turnOnPitr: {
    operationName: 'Turn on PITR',
    args: [],
    check: checkPitrEnabled,
    message: null,
    errorMessage: null,
    expectFromCheck: true,
    response: null,
    targetTable: null
  },
  turnOnDelPro: {
    operationName: 'Turn on Deletion Protection',
    args: [],
    check: checkDeletionProtectionEnabled,
    errorMessage: null,
    expectFromCheck: true,
    message: null,
    response: null,
    targetTable: null
  }
};

module.exports = operations;
