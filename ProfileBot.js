const { GraphQLClient } = require('@dlghq/dialog-api-utils');
const { Bot } = require('@dlghq/dialog-node-client');
const config = require('./config');
const gql = new GraphQLClient(config.graphql);
const db = require('./postgres')(config.postgres);
const onError = require('./onError');

class ProfileBot extends Bot {

    constructor(...args) {

        super(...args);
        this.messenger = undefined;
        this.users = [];
        this.tasks = [];

    }

    async start() {

        //this.messenger = await this.ready;
        this.tasks = await db.tasks.getAll();
        this.users = await this.getUsers();

        const tasksUserIds = this.tasks.map(task => task.user_id);

        console.log(this.users);

        for(const [userId, user] of this.users) {

            if(!userId) continue;

            if(tasksUserIds.indexOf(userId) !== -1) {
                this.users.delele(userId);
            }
            else {
                if(Object.keys(user.extensions).length === 0) {
                    // Отправляем меню "Начать и Позже"
                    await this.sendStartMenu(userId, user);
                }
                else {
                    // Продолжаем опрос
                    await this.sendNextQuestion(userId, user)
                }
            }
        }

        setTimeout(async function check() {
            try{
                //console.log(Date.now());
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

    async sendStartMenu(userId, user) {
        const messenger = await this.ready;
        const u = await messenger.findUsers(user.query);

        console.log(u);

        await this.sendInteractiveMessage(
            { type: 'user', id: userId },
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

    }

    onInteractiveEvent() {
        super.onInteractiveEvent(async event => {

            console.log(event)

        })
    }

    onMessage() {
        super.onMessage(async ({ peer, content }) => {

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
        })
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
        this.tasks.push(task);
    }

    async deleteTask(id) {
        await db.tasks.deleteTask(id);
        this.tasks = this.tasks.filter(task => task.id !== id)
    }

    onError() {
        super.onError(onError);
    }

}

module.exports = ProfileBot;