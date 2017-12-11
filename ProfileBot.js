const { GraphQLClient } = require('@dlghq/dialog-api-utils');
const { Bot } = require('@dlghq/dialog-node-client');
const Promise = require('bluebird');
const config = require('./config');
const gql = new GraphQLClient(config.graphql);
const db = require('./postgres')(config.postgres);
const onError = require('./onError');

class ProfileBot extends Bot {

    constructor(...args) {

        super(...args);
        this.messenger = undefined;
        this.users = undefined;
        this.tasks = undefined;

    }

    async start() {

        this.messenger = await this.ready;
        this.tasks = await this.getTasks();
        this.users = await this.getUsers();
        const myId = await this.getUid();

        this.users.delete(0);
        this.users.delete(myId);
        this.tasks.forEach(task => this.users.delele(task.user_id));

        await Promise.delay(3000);

        console.log("myId", myId);

        for(const [userId, user] of this.users) {
            if(Object.keys(user.extensions).length === 0) {
                // Отправляем меню "Начать и Позже"
                await this.sendStartMenu(userId);
            }
            else {
                // Продолжаем опрос
                await this.sendNextQuestion(userId, user)
            }
        }

        this.onInteractiveEvent(async event => {

            console.log(event);

            if(event.value === 'later') {
                console.log("LATER", event.uid);
                await this.sendTimeMenu(event.uid, this.users.get(event.uid));
            }
            else if(event.value === 'begin') {
                //await this.sendNextQuestion(event.uid, this.users.get(event.uid))
            }
        });

        this.onMessage(async ({ peer, content }) => {

            console.log(content.type);

            if (peer.type !== 'user' || content.type !== 'text') {
                return;
            }

            const user = this.users.get(peer.id);
            if (!user) {
                return;
            }

            const question = this.findCurrentQuestion(user);
            if (!question) {
                return;
            }

            await this.updateUserExtension(peer.id, question.id, content.text);

            user.extensions[question.id] = content.text;
            let message;

            const nextQuestion = this.findCurrentQuestion(user);
            if (nextQuestion) {
                message = nextQuestion.text;
            }
            else {
                const about = [
                    `ФИО: ${user.extensions.surname} ${user.extensions.name} ${user.extensions.patronymic}`,
                    `Регион: ${user.extensions.region}`,
                    `Работа: ${user.extensions.career} ${user.extensions.position}`
                ].join('\n');

                await this.updateUserAbout(peer.id, about);

                message = [
                    'Спасибо, что уделили время.',
                    'Ваш профиль:',
                    about
                ].join('\n');
            }

            await this.sendTextMessage({ id: peer.id, type: 'user' }, message);
        });

        const self = this;
        setTimeout(async function check() {
            try{
                const now = Date.now();

                for(const [taskId, task] of self.tasks) {
                    if(task.time >= now) {
                        await this.sendStartMenu(task.user_id);
                        await self.deleteTask(taskId);
                    }
                }

                setTimeout(check, config.checkInterval);
            }
            catch (error) {
                onError(error)
            }
        }, config.checkInterval);

    }

    async sendNextQuestion(userId, user) {
        const question = this.findCurrentQuestion(user);

        if (question) {
            await this.messenger.findUsers(user.query);
            await this.sendTextMessage({ userId, type: 'user' }, question.text);
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

    async sendTimeMenu(userId, user) {
        //await this.messenger.findUsers(user.query);
        await this.sendInteractiveMessage(
            { type: 'user', id: userId },
            `Через какое время напомнить?`,
            [
                {
                    actions: [
                        {
                            id: `one_hour`,
                            widget: {
                                type: 'button',
                                label: '1 час',
                                value: 1
                            }
                        },
                        {
                            id: `three_hours`,
                            widget: {
                                type: 'button',
                                label: '3 часа',
                                value: 3
                            }
                        },
                        {
                            id: `seven_hours`,
                            widget: {
                                type: 'button',
                                label: '7 часов',
                                value: 7
                            }
                        },
                        {
                            id: `twenty_four_hours`,
                            widget: {
                                type: 'button',
                                label: '24 часа',
                                value: 24
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

        //console.log(JSON.stringify(result));

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
        return new Map(tasks.map(task => [task.id, task]))
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
    }

    async updateUserExtension(uid, key, value) {
        await this.removeUserExtension(uid, key);
        await this.addUserExtension(uid, key, value);
    }

    findCurrentQuestion(user) {
        return config.questions.find((item) => !user.extensions[item.id]);
    }

    async setTask(userId, hours) {
        const task = await db.tasks.setTask(userId, Date.now() + hours * 3600);
        this.tasks.set(task.id, task);
    }

    async deleteTask(id) {
        await db.tasks.deleteTask(id);
        this.tasks.delete(id)
    }

    onError() {
        super.onError(onError);
    }

}

module.exports = ProfileBot;