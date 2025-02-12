const { DateTime } = require('luxon');
const {
  awsCommand,
  backToMenuOrExit,
  confirmInitiateCleanup,
  exit,
  getConsoleInput,
  getDateTimeInput,
  lineWrap
} = require('../functions');

const config = require('../config');
const { inputType } = config;

const operations = require('../operations');
const { duplicate, backupDynamoOG, backupDynamoDupe, restoreDynamo, deleteOG, turnOnPitr, turnOnDelPro } = operations;

const { performDuplicateTable } = require('./perform-duplicate-table');
const { performBackupOriginal } = require('./perform-backup-dynamo-original');
const { performBackupDuplicate } = require('./perform-backup-dynamo-duplicate');
const { performDeleteTable } = require('./perform-delete-table');
const { performRestoreDynamo } = require('./perform-restore-dynamo');
const { performTurnOnPitr } = require('./perform-turn-on-pitr');
const { performTurnOnDeletionProtection } = require('./perform-turn-on-deletion-protection');

/**
 * Process for performing a full backup using Point-in-Time Recovery (PITR). This function will
 * duplicate a table, backup the original table and the duplicate, delete the original table and
 * then restore it using the duplicate's backup. It will then delete the duplicate table and
 * enable PITR and Deletion Protection.
 *
 * @param   {Object} ops - operations object containing various AWS operations
 * @param   {String} chosenTable - user selected table
 * @returns {Object} updated ops object containing the result of performing the
 *                   specific actions for a PITR restore
 *
 */
async function performPitrSteps(ops, chosenTable) {
  // Operations required for this process
  ops.duplicate = duplicate;
  ops.backupDynamoOG = backupDynamoOG;
  ops.backupDynamoDupe = backupDynamoDupe;
  ops.restoreDynamo = restoreDynamo;
  ops.deleteOG = deleteOG;
  ops.turnOnPitr = turnOnPitr;
  ops.turnOnDelPro = turnOnDelPro;

  try {
    // Look for PITR backups
    console.log(`\n🔍 Looking at Point-in-Time Recovery for [${chosenTable}]...`);
    let backupsObj = await awsCommand(['dynamodb', 'describe-continuous-backups', '--table-name', chosenTable]);
    pitrBackups = backupsObj.ContinuousBackupsDescription;

    if (pitrBackups.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus == 'ENABLED') {
      // User confirms the PITR date/time they're restoring to
      let pitrTime = await confirmPitrDateTime(chosenTable, pitrBackups);

      // DUPLICATE
      ops = await performDuplicateTable(ops, chosenTable, pitrTime);

      // BACKUP the original table (just in case)
      ops = await performBackupOriginal(ops, chosenTable);

      // BACKUP the duplicate table after it's created
      ops = await performBackupDuplicate(ops);

      // DELETE the original table (confirm if Deletion Protection is enabled, confirm again before deleting)
      ops = await performDeleteTable(ops, chosenTable);

      // RESTORE the chosen table from the duplicate backup
      ops = await performRestoreDynamo(ops, chosenTable);

      // TURNING ON Point-in-Time Recovery again
      ops = await performTurnOnPitr(ops, chosenTable);

      // TURNING ON Deletion Protection again
      ops = await performTurnOnDeletionProtection(ops, chosenTable);

      // Initiate Cleanup
      await confirmInitiateCleanup(ops);

      console.log(`\n✨ PTIR restore successful! ✨');`);
    } else {
      // It may be that not all tables have PITR enabled
      console.log(
        lineWrap(
          `\n❗ Doesn't look like PITR is enabled for [${chosenTable}]. You can enable PITR for a table from the main menu.`
        )
      );
      await backToMenuOrExit();
      exit();
    }
  } catch (error) {
    console.error(error);
    throw error;
  }

  return ops;
}

/**
 * Lets the user see available restore times for a table's Point-in-Time recovery.
 * User is offered the earliest restorable time and latest restorable time and must
 * select a date/time between them using the acceptable DateTime format.
 *
 * @param   {Object} pitrBackups - object from AWS that contains information about
 *                                a table's PITR options
 * @returns {String} a DateTime item in the format of 'LLL dd yyyy - HH:mm:ss'
 *
 */
async function confirmPitrDateTime(chosenTable, pitrBackups) {
  let backups = pitrBackups.PointInTimeRecoveryDescription;

  // Convert backup times to a readable format, also the format expected to
  // be entered by user
  let earliestFormatted = DateTime.fromISO(backups.EarliestRestorableDateTime).toFormat(inputType);
  let latestFormatted = DateTime.fromISO(backups.LatestRestorableDateTime).toFormat(inputType);

  console.log(`\n*-------------------------------*                                   `);
  console.log(`|  🕑 CHOOSE A RESTORE TIME 🕑  |                                   `);
  console.log(`|------------------------------------------------------------------*`);
  console.log('|  Restorable Time              |  Date and Time                   |');
  console.log(`|------------------------------------------------------------------|`);
  console.log(`|  Earliest restorable time     |  ${earliestFormatted}          |`);
  console.log(`|  Latest restorable time       |  ${latestFormatted}          |`);
  console.log(`*------------------------------------------------------------------*`);

  // Confirm the date/time from the user
  let dateTimeInput = await getDateTimeInput(
    `\n🕑 How early would you like to restore?`,
    [inputType],
    earliestFormatted,
    latestFormatted
  );

  console.log(`\n*-------------------------------*                                   `);
  console.log(`| ❗ READ BEFORE CONTINUING ❗  |                                   `);
  console.log(`|------------------------------------------------------------------*`);
  console.log(`|  In order to recreate a table from PITR, this script will:       |`);
  console.log(`|------------------------------------------------------------------|`);
  console.log(`|  1. DUPLICATE the original table from the desired PITR date/time.|`);
  console.log(`|  2. BACKUP    the original to DynamoDB as a fallback.            |`);
  console.log(`|  3. BACKUP    the duplicate table after it's created in Step 1.  |`);
  console.log(`|  4. DELETE    the original table after it's backed up in Step 2. |`);
  console.log(`|               > CONFIRM: check if Deletion Protection is enabled.|`);
  console.log(`|               > CONFIRM: check again before deletion.            |`);
  console.log(`|  5. RESTORE   the original table from the duplicate backup.      |`);
  console.log(`|------------------------------------------------------------------|`);
  console.log(`|  🕑 PITR and Deletion Protection will then be activated again 🔒 |`);
  console.log(`*------------------------------------------------------------------*`);

  confirmRestoreTime = await getConsoleInput(
    `\n⭐ Confirm you want to restore [${chosenTable}] to [${dateTimeInput}] and continue?`,
    ['y', 'n']
  );

  // Rerun if user changes mind about time
  if (confirmRestoreTime == 'n') {
    dateTimeInput = await confirmPitrDateTime(chosenTable, pitrBackups);
  }
  return dateTimeInput;
}

module.exports = { performPitrSteps };
