-- Elevated-rights functions are for signed-in users only (each also checks the caller itself).
revoke execute on function cm_add_member(uuid, text, text), cm_create_workspace(text), cm_home_history(uuid), cm_link_warranty_data(uuid), cm_list_members(uuid) from public, anon;
grant execute on function cm_add_member(uuid, text, text), cm_create_workspace(text), cm_home_history(uuid), cm_link_warranty_data(uuid), cm_list_members(uuid) to authenticated, service_role;
