// Labels only. Authorization always uses the server-verified access role.
export function accessLabel(person, role = person?.role) {
  return role === 'owner' ? (person?.isPrimaryOwner ? 'Owner' : 'Administrator') : role === 'staff' ? 'Staff' : 'Client';
}
export function deskLabel(person) {
  return person?.role === 'owner' ? (person?.isPrimaryOwner ? 'Owner desk' : 'Admin desk') : 'Staff desk';
}
