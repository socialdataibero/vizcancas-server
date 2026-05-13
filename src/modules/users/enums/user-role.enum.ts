export enum UserRoleEnum {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  USER = 'USER',
}
export const UserRoles = <const>['ADMIN', 'MANAGER', 'USER'];
export type UserRoleType = (typeof UserRoles)[number];
