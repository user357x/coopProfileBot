module.exports = db => {
    return {
        getAll: () => db.any(`select * from public.tasks`),
        deleteTask: (id) => db.none('delete from public.tasks where id = $1', id),
        setTask: (data) => db.one(`insert into public.tasks(data) values($1) returning *`, [data])
    }
};