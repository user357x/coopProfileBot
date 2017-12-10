module.exports = db => {
    return {
        getAll: () => db.any(`select * from public.tasks`),
        deleteTask: (id) => db.none('delete from from public.tasks where id = $1', id),
        setTask: (user_id, time) => db.one(`insert into public.tasks(user_id, time) values($1, $2) returning *`, [user_id, time])
    }
};