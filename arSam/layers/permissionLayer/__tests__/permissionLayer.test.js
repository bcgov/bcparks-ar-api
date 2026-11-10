jest.mock('/opt/baseLayer', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}), { virtual: true });

describe('Permission Layer - roleFilter', () => {
  test('filters records when roles are stored as an array', async () => {
    const { roleFilter } = require('../permissionLayer');
    const records = [
      { sk: '0041', roles: ['sysadmin', '0041'] },
      { sk: '3883', roles: ['sysadmin', '3883'] },
    ];

    const result = await roleFilter(records, ['3883']);

    expect(result).toEqual([{ sk: '3883', roles: ['sysadmin', '3883'] }]);
  });

  test('filters records when roles are stored as a native Set', async () => {
    const { roleFilter } = require('../permissionLayer');
    const records = [
      { sk: '0041', roles: new Set(['sysadmin', '0041']) },
      { sk: '3883', roles: new Set(['sysadmin', '3883']) },
    ];

    const result = await roleFilter(records, ['3883']);

    expect(result).toHaveLength(1);
    expect(result[0].sk).toBe('3883');
  });

  test('filters records when roles are stored as a DynamoDB set-like object', async () => {
    const { roleFilter } = require('../permissionLayer');
    const records = [
      { sk: '0041', roles: { values: ['sysadmin', '0041'] } },
      { sk: '3883', roles: { values: ['sysadmin', '3883'] } },
    ];

    const result = await roleFilter(records, ['3883']);

    expect(result).toHaveLength(1);
    expect(result[0].sk).toBe('3883');
  });
});

