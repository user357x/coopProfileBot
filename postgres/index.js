const options = {
    extend : db => {
        db.tasks = require('./tasks')(db);
    },
    error : (error, e) => {
        if(e.cn) console.error("Ошибка соединения с базой данных!");
    }
};

const db = require('pg-promise')(options);

module.exports = db;