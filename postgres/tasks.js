module.exports = db => {
    return {
        getAll: () => db.any(`select * from public.tasks`),
        deleteTask: (id) => db.none('delete from from public.tasks where id = ?', id)
    }
};