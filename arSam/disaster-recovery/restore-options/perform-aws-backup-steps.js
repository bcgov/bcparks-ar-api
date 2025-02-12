const { DateTime } = require('luxon');
const {
  awsCommand,
  backToMenuOrExit,
  confirmInitiateCleanup,
  getConsoleInput,
  getNumberInput,
  lineWrap
} = require('../functions');

const config = require('../config.js');
const { vaultName } = config;

const operations = require('../operations');
const { backupDynamoOG, deleteOG, restoreAWS } = operations;

const { performBackupOriginal } = require('./perform-backup-dynamo-original');
const { performDeleteTable } = require('./perform-delete-table');
const { performRestoreAWS } = require('./perform-restore-aws');

/**
 * Process for performing a full backup using AWS Backup. This function will delete
 * the original table and then restore it from a backup in AWS Backup. It will then
 * enable Point-in-Time recovery and Deletion Protection (those settings are not
 * restored automatically).
 *
 * @param   {Object} ops - all operation types (eg. delete, restore, backup) that
 *                  contain the operation parameters for their respective operations.
 * @param   {String} chosenTable - user selected table
 * @returns {Object} updated ops object containing the result of performing the
 *                   specific actions for an AWS Backup restore
 *
 */
async function performAWSBackupSteps(ops, chosenTable) {
  // Operations required for this process
  ops.backupDynamoOG = backupDynamoOG;
  ops.deleteOG = deleteOG;
  ops.restoreAWS = restoreAWS;

  try {
    // Check that backups exist for the chosen table
    let backupsObj = await awsCommand([
      'backup',
      'list-recovery-points-by-backup-vault',
      '--backup-vault-name',
      `${vaultName}`,
      '--by-resource-type',
      'DynamoDB'
    ]);

    // Filter by recovery points where it matches the user's chosen table
    let backups = backupsObj.RecoveryPoints.filter((recoverPoints) => recoverPoints.ResourceName === chosenTable);

    if (backups.length > 0) {
      let chosenBackup = await confirmAWSBackupChoice(chosenTable, backups, false);

      // BACKUP the original table (just in case)
      ops = await performBackupOriginal(ops, chosenTable);

      // DELETE the original table (confirm if Deletion Protection is enabled, confirm again before deleting)
      ops = await performDeleteTable(ops, chosenTable);

      // RESTORE the chosen table from the duplicate backup
      ops = await performRestoreAWS(ops, chosenTable, chosenBackup);

      // Initiate Cleanup
      await confirmInitiateCleanup(ops);
    } else {
      // It may be that a table doesn't have any AWS Backups
      console.log(lineWrap(`\n❗ Doesn't look like there are any AWS Backups for [${chosenTable}].`));
      await backToMenuOrExit();
    }

    return ops;
  } catch (error) {
    throw error;
  }
}

/**
 * Let the user decide which backup they would like to restore from AWS Backups.
 *
 * @param   {String} chosenTable - the selected table used to look for backups
 * @param   {Array}  backups - the backups available from AWS Backups
 * @param   {String} manual - a flag to discern if this is a manual backup or part of
 *                   the AWS Backup Snapshot process. Only difference is console log at
 *                   the end of the function.
 * @returns {Object} the user-selected object from the backups array
 */
async function confirmAWSBackupChoice(chosenTable, backups, manual = true) {
  let currentTime = DateTime.now().toISO();
  console.log(`\n🔍 Looking at the AWS Backups for [${chosenTable}]...`);

  // Continue asking the user until they've decided on a backup choice.
  while (true) {
    console.log(`\n*-------------------------------*                                   `);
    console.log(`|  💾 CHOOSE A BACKUP 💾        |                                   `);
    console.log(`|------------------------------------------------------------------*`);
    console.log('|  Backup # |  Date         |  Name                     |  Storage |');
    console.log(`|------------------------------------------------------------------|`);

    for (let i = 0; i < backups.length; i++) {
      // Make sure the backups are completed and match table
      if (backups[i].Status === 'COMPLETED' && backups[i].ResourceName === chosenTable) {
        let dateTime = DateTime.fromISO(backups[i].CompletionDate).toFormat('LLL dd yyyy');
        let resource = backups[i].ResourceName;
        let resourceLength = resource.length;
        // Trim resource names that are too long
        resource = resourceLength >= 25 ? resource.slice(0, 21) + '...' : resource;

        // Share if it's cold or warm storage
        let storageType = '-';
        let coldStorageTime = backups[i].CalculatedLifecycle.MoveToColdStorageAt;
        if (coldStorageTime < currentTime) {
          storageType = 'Cold ⛄';
        } else {
          storageType = 'Warm 🔥';
        }

        console.log(
          `|     ${i + 1}     |  ${dateTime}  |  ${resource}${Array(
            25 - (resourceLength < 25 ? resourceLength : 24)
          ).join(' ')} |  ${storageType} |`
        );
      } else {
        console.log(`  No backups available for [${chosenTable}]!`);
        console.log(`|------------------------------------------------------------------|`);
        console.log('|  Try rerunning the script. 👋 Exiting...');
        console.log(`*------------------------------------------------------------------*`);
        exit();
      }
    }
    console.log(`|------------------------------------------------------------------|`);
    console.log(`| ⛄ Cold storage type takes -SIGNIFICANTLY- longer to restore ⛄  |`);
    console.log(`*------------------------------------------------------------------*`);

    // User selects the backup they want to provide for restore
    let chosenBackup = await getNumberInput(`\n💾 Which [${chosenTable}] backup would you like to restore from?`, [
      backups.length
    ]);

    // Warn users about cold storage restore times
    let coldStorageTime = backups[chosenBackup - 1].CalculatedLifecycle.MoveToColdStorageAt;
    if (coldStorageTime < currentTime) {
      confirmedColdStorage = await getConsoleInput(
        `\n⛄❗ Please note that restore from cold storage can take SEVERAL hours - continue?`,
        ['y', 'n']
      );

      // User changes their mind on which backup they want to use
      if (confirmedColdStorage == 'n') {
        console.log('Please select another backup.');
        continue;
      }
    }

    // Only show this message if it's the full AWS Snapshot restore.
    console.log(`\n*-------------------------------*                                 `);
    console.log(`| ❗ READ BEFORE CONTINUING ❗  |                                   `);
    console.log(`|------------------------------------------------------------------*`);
    console.log(`|  In order to recreate a table from AWS Backup, this script will: |`);
    console.log(`|------------------------------------------------------------------|`);
    console.log(`|  1. BACKUP   the original to DynamoDB as a fallback.             |`);
    console.log(`|  1. DELETE   the original table                                  |`);
    console.log(`|              > CONFIRM: check if Deletion Protection is enabled. |`);
    console.log(`|              > CONFIRM: the table again before deletion.         |`);
    console.log(`|  2. RESTORE  the original from the backup                        |`);
    console.log(`*------------------------------------------------------------------*`);

    // Confirm they want to continue with this restore choice
    let chosenBackupNumber = DateTime.fromISO(backups[chosenBackup - 1].CompletionDate).toFormat('LLL dd yyyy');
    let confirmBackup = await getConsoleInput(
      `\n⭐ Confirm you want to restore [${chosenTable}] from [${chosenBackupNumber}] and continue?`,
      ['y', 'n']
    );

    // User changes their mind on which backup they want to use
    if (confirmBackup == 'n') {
      console.log('Please select another backup.');
      continue;
    }

    return backups[chosenBackup - 1];
  }
}

module.exports = { performAWSBackupSteps };
