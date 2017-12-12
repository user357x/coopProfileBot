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
        this.users = undefined;
        this.tasks = undefined;
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

        this.onInteractiveEvent(async event => {
            switch(event.value) {
                case 'begin':
                    await this.sendNextQuestion(event.uid);
                    break;

                case 'later':
                    await this.sendTimeMenu(event.uid);
                    break;

                case 'one_hour':
                    await this.setTask(event.uid, 1);
                    break;

                case 'three_hours':
                    await this.setTask(event.uid, 3);
                    break;

                case 'seven_hours':
                    await this.setTask(event.uid, 7);
                    break;

                case 'twenty_four_hours':
                    await this.setTask(event.uid, 24);
                    break;
            }
        });

        this.onMessage(async ({ peer, content }) => {
            //console.log(content.type);

            if (peer.type !== 'user' || content.type !== 'text') {
                return;
            }

            const user = this.users.get(peer.id);
            if (!user) {
                return;
            }

            const currentQuestion = this.findCurrentQuestion(user);
            if (!currentQuestion) {
                return;
            }

            await this.updateUserExtension(peer.id, currentQuestion.id, content.text);

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

        this.on('error', onError);

        this.startCheckTimer();
    }

    startCheckTimer() {
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

                setTimeout(check, config.checkInterval);
            }
            catch (error) {
                onError(error)
            }
        }, config.checkInterval);
    }

    async sendNextQuestion(userId) {
        const question = this.findCurrentQuestion(this.users.get(userId));

        if (question) {
            await this.sendTextMessage({ id: userId, type: 'user' }, question.text);
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
                            id: `one_hour`,
                            widget: {
                                type: 'button',
                                label: '1 час',
                                value: 'one_hour'
                            }
                        },
                        {
                            id: `three_hours`,
                            widget: {
                                type: 'button',
                                label: '3 часа',
                                value: 'three_hours'
                            }
                        },
                        /*
                        {
                            id: `seven_hours`,
                            widget: {
                                type: 'button',
                                label: '7 часов',
                                value: 'seven_hours'
                            }
                        },
                        {
                            id: `seven_hours`,
                            widget: {
                                type: 'button',
                                label: '7 часов',
                                value: 'seven_hours'
                            }
                        },
                        {
                            id: `twenty_four_hours`,
                            widget: {
                                type: 'button',
                                label: '24 часа',
                                value: 'twenty_four_hours'
                            }
                        }
                        */
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
        this.users.delete(uid);
    }

    async updateUserExtension(uid, key, value) {
        await this.removeUserExtension(uid, key);
        await this.addUserExtension(uid, key, value);
    }

    findCurrentQuestion(user) {
        return config.questions.find((item) => !user.extensions[item.id]);
    }

    async setTask(userId, hours) {
        const task = await db.tasks.setTask({ userId: userId, time: Date.now() + hours * 30 * 1000 });
        this.tasks.set(task.id, task.data);
    }

    async deleteTask(id) {
        await db.tasks.deleteTask(id);
        this.tasks.delete(id)
    }

}

module.exports = ProfileBot;