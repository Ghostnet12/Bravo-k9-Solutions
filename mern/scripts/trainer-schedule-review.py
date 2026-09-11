from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'tests/workspace-api.test.js';s=p.read_text();old="  t.mock.method(Settings, 'updateOne', async () => ({}));";assert s.count(old)==1;s=s.replace(old,old+"\n  // Assigned visits now acquire the shared reservation/schedule write lock.\n  t.mock.method(Settings, 'findOneAndUpdate', () => query({ enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['09:00'] }));");p.write_text(s)
p=root/'server/trainer-schedules.js';s=p.read_text();s=s.replace('const id = objectId.parse(req.params.id);','const id = objectId.parse(req.params.id).toLowerCase();');p.write_text(s)
print('Extended the isolated assignment fixture for the new scheduling lock.')
