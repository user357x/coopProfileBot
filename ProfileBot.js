const { GraphQLClient } = require('@dlghq/dialog-api-utils');
const { Bot } = require('@dlghq/dialog-node-client');
const Promise = require('bluebird');
const config = require('./config');
const gql = new GraphQLClient(config.graphql);
const db = require('./postgres')(config.postgres);
const { onMessage, onInteractiveEvent, onError } = require('./handlers');
const { questions, times, regions, statuses } = require('./data');
const questionIds = Object.keys(questions);

class ProfileBot extends Bot {

    constructor(...args) {
        super(...args);
        this.users = undefined;
        this.tasks = undefined;

        this.timeMenuOptions = Object.keys(times).map((key, i) => {
            return {
                label: times[key].label,
                value: times[key].value
            }
        });

        this.timeMenuOptions.unshift({
            label: 'выберите время',
            value: 'default'
        });

        this.regionMenuOptions = Object.keys(regions).map((key, i) => {
            return {
                label: regions[key],
                value: key
            }
        });

        this.regionMenuOptions.unshift({
            label: 'выберите регион',
            value: 'default'
        });

        this.statusMenuOptions = Object.keys(statuses).map((key, i) => {
            return {
                label: statuses[key].label,
                value: key
            }
        });

        this.statusMenuOptions.unshift({
            label: 'выберите статус',
            value: 'default'
        });

        this.profileMenuOptions = Object.keys(questions).map((key, i) => {
            return {
                label: questions[key].label,
                value: key
            }
        });

        this.profileMenuOptions.unshift({
            label: 'выберите поле',
            value: 'default'
        });
    }

    async start() {

        this.tasks = await this.getTasks();
        this.users = await this.getUsers();
        const myId = await this.getUid();

        this.users.delete(0);
        this.users.delete(myId);

        this.tasks.forEach(task => this.users.delete(task.userId), this);

        await Promise.delay(3000);

        for(const [userId, user] of this.users) {
            if(Object.keys(user.extensions).length === 0) {
                // Отправляем меню "Начать и Позже"
                await this.sendStartMenu(userId);
            }
            else {
                // Продолжаем опрос
                await this.sendNextQuestion(userId)
            }
        }

        this.onMessage(onMessage(this));
        this.onInteractiveEvent(onInteractiveEvent(this));
        this.on('error', onError);

        this.startCheckTimer(config.checkInterval);
    }

    startCheckTimer(checkInterval) {
        const self = this;
        setTimeout(async function check() {
            try{
                const now = Date.now();

                for(const [taskId, task] of self.tasks) {
                    if(task.time <= now) {
                        await self.sendStartMenu(task.userId);
                        await self.deleteTask(taskId);
                    }
                }

                setTimeout(check, checkInterval);
            }
            catch (error) {
                onError(error)
            }
        }, checkInterval);
    }

    getNextQuestionId(extensions) {
        return questionIds.find(id => !extensions[id]);
    }

    async sendNextQuestion(userId) {
        const questionId = this.getNextQuestionId(this.users.get(userId).extensions);

        if (questionId) {
            switch (questionId) {
                case 'region':
                    await this.sendRegionMenu(userId, questions.region.text);
                    break;

                case 'status':
                    await this.sendStatusMenu(userId, questions.status.text);
                    break;

                default:
                    await this.sendTextMessage({ id: userId, type: 'user' }, questions[questionId].text);
                    break;
            }
            //await Promise.delay(1000);
        }
    }

    async sendStartMenu(userId) {
        await this.sendInteractiveMessage(
            { id: userId, type: 'user' },
            `Добрый день, я автоматизированный помощник, помогу вам заполнить профиль. 
            С заполненным профилем потенциальный партнер найдет вас быстрее и больше людей смогут узнать о ваших услугах. 
            В среднем заполнение профиля занимает не больше 2 минут. Начнем?`,
            [
                {
                    actions: [
                        {
                            id: `begin`,
                            widget: {
                                type: 'button',
                                label: 'Начать',
                                value: 'begin'
                            }
                        },
                        {
                            id: `later`,
                            widget: {
                                type: 'button',
                                label: 'Позже',
                                value: 'later'
                            }
                        }
                    ]
                }
            ]
        );
    }

    async sendTimeMenu(userId) {
        await this.sendInteractiveMessage(
            { id: userId, type: 'user' },
            `Через какое время напомнить?`,
            [
                {
                    actions: [
                        {
                            id: 'timeMenu',
                            defaultValue: 'default',
                            widget: {
                                type: 'select',
                                options: this.timeMenuOptions
                            }
                        }
                    ]
                }
            ]
        );
    }

    async sendRegionMenu(userId, text) {
        await this.sendInteractiveMessage(
            { id: userId, type: 'user' },
            text,
            [
                {
                    actions: [
                        {
                            id: 'regionMenu',
                            defaultValue: 'default',
                            widget: {
                                type: 'select',
                                options: this.regionMenuOptions
                            }
                        }
                    ]
                }
            ]
        );
    }

    async sendStatusMenu(userId, text) {
        await this.sendInteractiveMessage(
            { id: userId, type: 'user' },
            text,
            [
                {
                    actions: [
                        {
                            id: 'statusMenu',
                            defaultValue: 'default',
                            widget: {
                                type: 'select',
                                options: this.statusMenuOptions
                            }
                        }
                    ]
                }
            ]
        );
    }

    async sendProfileMenu(userId) {

        await this.sendInteractiveMessage(
            { id: userId, type: 'user' },
            'Выберите позицию, которую хотите исправить',
            [
                {
                    actions: [
                        {
                            id: 'profileMenu',
                            defaultValue: 'default',
                            widget: {
                                type: 'select',
                                options: this.profileMenuOptions
                            }
                        }
                    ]
                }
            ]
        );
    }

    async getUsers() {
        const result = await gql.graphql(
            {
                query : `{
                    users: users_list(is_deleted: false, is_bot: false) {
                        edges {
                            node {
                                id
                                name
                                emails
                                phones
                                nickname
                                extensions
                            }
                        }
                    }
                }`
            }
        );

        const items = result.users.edges.map((user) => {
            const id = parseInt(user.node.id, 10);
            return [id, {
                name: user.node.name,
                query: user.node.emails[0] || user.node.phones[0] || user.node.nickname,
                extensions: JSON.parse(user.node.extensions)
            }];
        });

        return new Map(items);
    }

    async getTasks() {
        const tasks = await db.tasks.getAll();
        return new Map(tasks.map(task => [task.id, task.data]))
    }

    async addUserExtension(uid, key, value) {
        await gql.graphql({
            query: `mutation ($uid: ID!, $key: String!, $value: String!) {
                users_add_extension(user_id: $uid, key: $key, value: {string: $value})
            }`,
            variables: { uid, key, value }
        });
        this.users.get(uid).extensions[key] = value;
    }

    async removeUserExtension(uid, key) {
        await gql.graphql({
            query: `mutation ($uid: ID!, $key: String!) {
                users_remove_extension(user_id: $uid, key: $key)
            }`,
            variables: { uid, key }
        });
        delete this.users.get(uid).extensions[key];
    }

    async updateUserAbout(uid, about) {
        await gql.graphql({
            query: `mutation ($uid: ID!, $about: String!) {
                users_update(user_id: $uid, about: $about) {
                    id
                }
            }`,
            variables: { uid, about }
        });
        //this.users.delete(uid);
    }

    async updateUserExtension(uid, key, value) {
        await this.removeUserExtension(uid, key);
        await this.addUserExtension(uid, key, value);
    }

    async setTask(userId, hours) {
        const task = await db.tasks.setTask({ userId: userId, time: Date.now() + hours * 10 * 1000 });
        this.tasks.set(task.id, task.data);
    }

    async deleteTask(id) {
        await db.tasks.deleteTask(id);
        this.tasks.delete(id)
    }

}

module.exports = ProfileBot;