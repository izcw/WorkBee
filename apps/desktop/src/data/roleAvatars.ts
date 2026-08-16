import role1 from '../assets/images/team-avatars/role1.png';
import role2 from '../assets/images/team-avatars/role2.png';
import role3 from '../assets/images/team-avatars/role3.png';
import role4 from '../assets/images/team-avatars/role4.png';
import role5 from '../assets/images/team-avatars/role5.png';
import role6 from '../assets/images/team-avatars/role6.png';

export const DEFAULT_ROLE_AVATARS = [role1, role2, role3, role4, role5, role6];

const builtInRoleAvatars: Record<string, string> = {
  workbee: role1,
};

export function roleAvatar(role?: Pick<RoleConfig, 'id' | 'avatar'>) {
  const value = roleAvatarValue(role);
  if (value.startsWith('builtin:')) return builtInRoleAvatars[value.slice(8)] || DEFAULT_ROLE_AVATARS[0];
  if (value.startsWith('default:')) return DEFAULT_ROLE_AVATARS[Math.max(0, Number(value.slice(8)) - 1)] || DEFAULT_ROLE_AVATARS[0];
  return value;
}

export function roleAvatarValue(role?: Pick<RoleConfig, 'id' | 'avatar'>) {
  return role?.avatar || (role && builtInRoleAvatars[role.id] ? `builtin:${role.id}` : 'default:1');
}

export { role1 };
