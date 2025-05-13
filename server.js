// Простой серверный скрипт для интеграции с ЮKassa
// Для запуска: node server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройка CORS для запросов с фронтенда
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Для хранения заказов (в реальном приложении используйте базу данных)
const orders = {};

// Инициализация ЮKassa
// ВНИМАНИЕ: В реальном приложении эти данные должны храниться в безопасном месте (env переменные)
const shopId = '1053058'; // Ваш идентификатор магазина ЮKassa
const secretKey = 'test_fItob0t2XOZPQETIa7npqoKf5PsxbXlrMTHV88P4WZA'; // ВАЖНО: Замените на ваш секретный ключ из личного кабинета ЮKassa
let yooKassa = null;

// Работаем с реальной библиотекой YooKassa
const isTestMode = false;

// Инициализация клиента ЮKassa
try {
    if (!isTestMode) {
        const YooKassa = require('yookassa');
        yooKassa = new YooKassa({
            shopId: shopId,
            secretKey: secretKey
        });
        console.log('ЮKassa клиент инициализирован');
    } else {
        console.log('Работаем в тестовом режиме без реальной библиотеки YooKassa');
    }
} catch (error) {
    console.error('Ошибка инициализации ЮKassa:', error);
    console.error('Установите библиотеку командой: npm install yookassa --save');
}

// Маршрут для обслуживания HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Маршрут для создания платежа в ЮKassa
app.post('/api/create-payment', async (req, res) => {
    console.log('Получен запрос на создание платежа:', req.body);
    
    try {
        const { amount, description, userId, planName } = req.body;

        if (!amount || !userId) {
            console.error('Не указаны обязательные параметры:', req.body);
            return res.status(400).json({ error: 'Не указаны обязательные параметры' });
        }

        // Если работаем с реальной ЮKassa
        if (!isTestMode && yooKassa) {
            try {
                // Создаем заказ в ЮKassa
                let idempotenceKey;
                try {
                    idempotenceKey = crypto.randomUUID();
                } catch (e) {
                    // Для совместимости со старыми версиями Node.js
                    idempotenceKey = Math.random().toString(36).substring(2, 15) + 
                                    Math.random().toString(36).substring(2, 15);
                }
                
                console.log('Создаем платеж в ЮKassa с параметрами:', {
                    amount, description, idempotenceKey
                });
                
                const payment = await yooKassa.createPayment({
                    amount: {
                        value: amount,
                        currency: 'RUB'
                    },
                    confirmation: {
                        type: 'embedded',
                        locale: 'ru_RU'
                    },
                    capture: true, // Автоматически принимать поступившие средства
                    description: description || `Подписка ${planName || 'на бота'}`,
                    metadata: {
                        userId: userId,
                        planName: planName || 'Стандарт'
                    }
                }, idempotenceKey);
                
                // Сохраняем информацию о заказе
                orders[payment.id] = {
                    status: payment.status,
                    userId: userId,
                    amount: amount,
                    planName: planName || 'Стандарт',
                    createdAt: new Date()
                };
                
                console.log('Платеж успешно создан:', payment.id);
                console.log('Данные для встроенной оплаты:', payment.confirmation);
                
                // Отправляем клиенту информацию о платеже
                return res.json({
                    orderId: payment.id,
                    status: payment.status,
                    confirmationToken: payment.confirmation.confirmation_token,
                    amount: amount,
                    testMode: false
                });
            } catch (yooKassaError) {
                console.error('Ошибка при создании платежа в ЮKassa:', yooKassaError);
                
                // Если возникла ошибка с API ЮKassa, но мы хотим все равно показать интерфейс
                // Можно вернуть тестовый режим как запасной вариант
                console.log('Переключаемся на тестовый режим из-за ошибки...');
                return createTestPayment(amount, description, userId, planName, res);
            }
        } else {
            // Тестовый режим
            return createTestPayment(amount, description, userId, planName, res);
        }
    } catch (error) {
        console.error('Ошибка при создании платежа:', error);
        res.status(500).json({ error: 'Не удалось создать платеж', details: error.message });
    }
});

// Функция для создания тестового платежа
function createTestPayment(amount, description, userId, planName, res) {
    // Генерируем уникальный ID заказа
    let orderId;
    try {
        orderId = 'order_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    } catch (e) {
        orderId = 'order_' + Math.random().toString(36).substring(2, 15) + 
                        Math.random().toString(36).substring(2, 15);
    }
    
    console.log('Создаем тестовый платеж с параметрами:', {
        orderId, amount, description
    });
    
    // Создаем фейковый токен для тестирования
    const fakeToken = Buffer.from(JSON.stringify({
        orderId: orderId,
        amount: amount,
        desc: description,
        time: Date.now()
    })).toString('base64');
    
    // Сохраняем информацию о заказе
    orders[orderId] = {
        status: 'pending',
        userId: userId,
        amount: amount,
        planName: planName || 'Стандарт',
        createdAt: new Date()
    };
    
    console.log('Тестовый платеж создан:', orderId);
    
    // Отправляем клиенту информацию о платеже
    return res.json({
        orderId: orderId,
        status: 'pending',
        confirmationToken: fakeToken,
        amount: amount,
        testMode: true // Флаг для фронтенда, что мы в тестовом режиме
    });
}

// Маршрут для имитации оплаты (для тестового режима)
app.post('/api/test-payment', async (req, res) => {
    const { orderId } = req.body;
    
    if (!orderId || !orders[orderId]) {
        return res.status(400).json({ error: 'Неверный ID заказа' });
    }
    
    console.log(`Имитация успешной оплаты для заказа ${orderId}`);
    
    // Обновляем статус заказа
    orders[orderId].status = 'succeeded';
    
    res.json({
        orderId: orderId,
        status: 'succeeded',
        message: 'Тестовая оплата успешно выполнена'
    });
});

// Маршрут для webhook от ЮKassa
app.post('/api/webhook', async (req, res) => {
    // Ключ из уведомления
    const requestBody = req.body;
    
    try {
        console.log('Получено webhook-уведомление:', JSON.stringify(requestBody));
        
        const event = requestBody.event;
        const paymentId = requestBody.object?.id;
        
        if (!event || !paymentId) {
            console.error('Некорректные данные в webhook-уведомлении');
            return res.status(400).json({ error: 'Некорректные данные' });
        }
        
        console.log(`Получено уведомление: ${event} для платежа ${paymentId}`);
        
        // Проверка аутентичности уведомления (в реальном приложении добавьте проверку подписи)
        // См. документацию: https://yookassa.ru/developers/using-api/webhooks
        
        if (event === 'payment.succeeded') {
            // Платеж успешно завершен
            if (orders[paymentId]) {
                orders[paymentId].status = 'succeeded';
                
                // В реальном приложении здесь нужно обновить информацию в базе данных
                // И отправить уведомление пользователю через бота
                console.log(`Платеж ${paymentId} успешно завершен`);
            } else {
                console.log(`Платеж ${paymentId} не найден в локальной базе, но успешно завершен`);
                // Создаем запись, если ее нет
                orders[paymentId] = {
                    status: 'succeeded',
                    createdAt: new Date()
                };
            }
        } else if (event === 'payment.canceled') {
            // Платеж отменен
            if (orders[paymentId]) {
                orders[paymentId].status = 'canceled';
                console.log(`Платеж ${paymentId} отменен`);
            } else {
                console.log(`Платеж ${paymentId} не найден в локальной базе, но отменен`);
            }
        }
        
        // Отвечаем сервису ЮKassa, что уведомление обработано
        res.sendStatus(200);
    } catch (error) {
        console.error('Ошибка при обработке webhook:', error);
        res.status(500).json({ error: 'Ошибка при обработке webhook' });
    }
});

// Маршрут для проверки статуса платежа
app.get('/api/payment-status/:orderId', async (req, res) => {
    const { orderId } = req.params;
    console.log(`Проверка статуса платежа: ${orderId}`);
    
    // Если работаем с реальной ЮKassa и orderId не из тестового режима
    if (!isTestMode && yooKassa && !orderId.startsWith('order_')) {
        try {
            // Получаем информацию о платеже из API ЮKassa
            const payment = await yooKassa.getPaymentInfo(orderId);
            
            // Обновляем статус в нашей локальной "базе данных"
            if (orders[orderId]) {
                orders[orderId].status = payment.status;
            } else {
                orders[orderId] = {
                    status: payment.status,
                    amount: payment.amount.value,
                    createdAt: new Date()
                };
            }
            
            console.log(`Получен статус платежа ${orderId} из ЮKassa: ${payment.status}`);
            
            return res.json({
                orderId: payment.id,
                status: payment.status,
                realStatus: true
            });
        } catch (error) {
            console.error('Ошибка при получении информации о платеже из ЮKassa:', error);
            
            // Если не удалось получить статус из ЮKassa, проверяем локальный статус
            if (orders[orderId]) {
                return res.json({
                    orderId: orderId,
                    status: orders[orderId].status,
                    realStatus: false
                });
            } else {
                return res.status(404).json({ error: 'Заказ не найден' });
            }
        }
    }
    
    // Проверяем статус в нашей локальной "базе данных" (для тестового режима)
    if (orders[orderId]) {
        console.log(`Получен статус платежа ${orderId} из локальной БД: ${orders[orderId].status}`);
        
        return res.json({
            orderId: orderId,
            status: orders[orderId].status,
            realStatus: false
        });
    } else {
        console.log(`Заказ ${orderId} не найден`);
        return res.status(404).json({ error: 'Заказ не найден' });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Откройте http://localhost:${PORT} в браузере`);
}); 