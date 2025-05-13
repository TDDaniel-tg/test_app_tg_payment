// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;

// Основные настройки приложения
const CONFIG = {
    apiUrl: window.location.origin, // Базовый URL для API
    userId: tg.initDataUnsafe?.user?.id || getQueryParam('userId') || 'test_user', // ID пользователя Telegram
    userName: tg.initDataUnsafe?.user?.first_name || getQueryParam('userName') || 'Тестовый пользователь',
    isDev: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
};

// Подписки и их цены
const PLANS = [
    { id: 'basic', name: 'Базовый', price: 199, description: 'Доступ к основным функциям бота на 1 месяц' },
    { id: 'standard', name: 'Стандартный', price: 499, description: 'Доступ ко всем функциям бота на 1 месяц' },
    { id: 'premium', name: 'Премиум', price: 999, description: 'Доступ ко всем функциям бота на 3 месяца со скидкой' }
];

// Глобальные переменные для отслеживания платежа
let currentOrderId = null;
let paymentCheckActive = false;

// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Открываем Telegram WebApp (сообщаем что приложение готово)
    tg.expand();
    tg.ready();

    // Инициализируем интерфейс
    initUI();
    initEventListeners();
    
    // Проверяем параметры URL для определения статуса платежа
    checkUrlForPaymentStatus();

    console.log('Telegram WebApp initialized', CONFIG.userId);
});

// Проверка URL на наличие параметров возврата от YooKassa
function checkUrlForPaymentStatus() {
    const orderId = getQueryParam('order_id') || getQueryParam('orderId');
    const success = getQueryParam('success');
    const paymentId = getQueryParam('payment_id');
    
    console.log('Проверка URL на статус платежа:', { orderId, success, paymentId });
    
    if (orderId && (success === 'true' || success === '1' || paymentId)) {
        console.log('Обнаружен успешный платеж в URL:', orderId);
        handleSuccessfulPayment(orderId);
    }
}

// Инициализация основного интерфейса
function initUI() {
    // Получаем имя пользователя
    const userNameElement = document.getElementById('userName');
    if (userNameElement) {
        userNameElement.innerText = CONFIG.userName;
    }

    // Генерируем карточки подписок
    const plansContainer = document.getElementById('plans');
    if (plansContainer) {
        PLANS.forEach(plan => {
            const planCard = createPlanCard(plan);
            plansContainer.appendChild(planCard);
        });
    }

    // Скрываем модальное окно успешной оплаты при загрузке
    const successModal = document.getElementById('successModal');
    if (successModal) {
        successModal.classList.add('hidden');
    }
}

// Добавляем обработчики событий
function initEventListeners() {
    // Обработчик для закрытия модального окна успешной оплаты
    const closeSuccessBtn = document.getElementById('closeSuccess');
    if (closeSuccessBtn) {
        closeSuccessBtn.addEventListener('click', () => {
            document.getElementById('successModal').classList.add('hidden');
            // Закрываем приложение Telegram после закрытия модального окна
            tg.close();
        });
    }
    
    // Добавляем обработчик для кнопки проверки платежа
    const checkPaymentButton = document.getElementById('checkPaymentButton');
    if (checkPaymentButton) {
        checkPaymentButton.addEventListener('click', () => {
            console.log('Ручная проверка статуса платежа');
            // Получаем текущий orderId
            if (currentOrderId) {
                // Изменяем текст кнопки для обратной связи
                checkPaymentButton.textContent = 'Проверяем статус платежа...';
                checkPaymentButton.disabled = true;
                
                // Пытаемся проверить статус платежа
                forceCheckPaymentStatus(currentOrderId).then(isSuccess => {
                    if (!isSuccess) {
                        // Если не удалось подтвердить платеж автоматически, спрашиваем пользователя
                        if (confirm('Не удалось автоматически определить статус платежа. Если вы уверены, что оплата прошла успешно, нажмите OK для активации подписки.')) {
                            handleSuccessfulPayment(currentOrderId);
                        } else {
                            // Возвращаем кнопку в исходное состояние
                            checkPaymentButton.textContent = 'Я уже оплатил, но не вижу подтверждения';
                            checkPaymentButton.disabled = false;
                        }
                    }
                    // Если isSuccess = true, то handleSuccessfulPayment уже будет вызван в forceCheckPaymentStatus
                });
            } else {
                alert('Не удалось определить идентификатор текущего платежа.');
            }
        });
    }

    // Глобальный обработчик для перехвата сообщений от YooKassa
    window.addEventListener('message', function(event) {
        try {
            console.log('Получено сообщение от window.message:', event.data);
            
            // Проверяем на наличие данных от YooKassa
            if (event.data && typeof event.data === 'object') {
                // Различные шаблоны данных, которые могут прийти от YooKassa
                if (
                    (event.data.type && event.data.type.startsWith('yookassa')) ||
                    (event.data.source && event.data.source === 'yookassa-checkout-widget') ||
                    (event.data.status && (event.data.status === 'success' || event.data.status === 'succeeded'))
                ) {
                    console.log('Обнаружено сообщение об оплате:', event.data);
                    
                    // Получаем orderId из сообщения или используем текущий
                    const messageOrderId = 
                        event.data.orderId || 
                        event.data.order_id || 
                        event.data.paymentId || 
                        event.data.payment_id || 
                        currentOrderId;
                    
                    if (messageOrderId) {
                        // Проверяем, действительно ли платеж успешен
                        forceCheckPaymentStatus(messageOrderId).then(isSuccess => {
                            if (isSuccess) {
                                // Платеж успешен - показываем сообщение
                                handleSuccessfulPayment(messageOrderId);
                            } else {
                                // Дополнительно проверяем, вдруг статус еще не обновился на сервере
                                setTimeout(() => {
                                    forceCheckPaymentStatus(messageOrderId);
                                }, 2000);
                            }
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка при обработке сообщения window:', error);
        }
    });
    
    // Добавляем обработчик для кнопки Назад в мини-приложении
    tg.BackButton.onClick(() => {
        // Если открыто модальное окно с оплатой, закрываем его
        const paymentModal = document.getElementById('paymentModal');
        if (paymentModal && !paymentModal.classList.contains('hidden')) {
            paymentModal.classList.add('hidden');
            tg.BackButton.hide();
            return;
        }
        
        // Если открыто модальное окно успеха, закрываем его и закрываем мини-приложение
        const successModal = document.getElementById('successModal');
        if (successModal && !successModal.classList.contains('hidden')) {
            successModal.classList.add('hidden');
            tg.close();
            return;
        }
    });
}

// Функция для обработки успешного платежа
function handleSuccessfulPayment(orderId) {
    console.log('Обработка успешного платежа:', orderId);
    
    // Проверяем, был ли уже обработан этот платеж
    if (document.getElementById('successModal') && 
        !document.getElementById('successModal').classList.contains('hidden')) {
        console.log('Платеж уже обработан, пропускаем повторное уведомление');
        return;
    }
    
    // Остановка всех проверок статуса платежа
    stopPaymentChecks();
    
    // Закрываем модальное окно с формой оплаты
    const paymentModal = document.getElementById('paymentModal');
    if (paymentModal) {
        paymentModal.classList.add('hidden');
    }
    
    // Скрываем индикатор загрузки
    hideLoader();
    
    // Используем нативный попап Telegram вместо модального окна
    if (tg.showPopup && typeof tg.showPopup === 'function') {
        // Показываем попап через Telegram Web App API
        tg.showPopup({
            title: 'Оплата успешна!',
            message: 'Ваша подписка успешно активирована',
            buttons: [{ type: 'close' }]
        }, function() {
            // После закрытия попапа закрываем мини-приложение
            tg.close();
        });
    } else {
        // Запасной вариант - показываем наше модальное окно
        showSuccessModal();
        
        // Показываем кнопку Закрыть в нижней части экрана
        tg.MainButton.setText('ЗАКРЫТЬ');
        tg.MainButton.show();
        tg.MainButton.onClick(() => {
            tg.close();
        });
    }
    
    // Скрываем кнопку Назад
    if (tg.BackButton) {
        tg.BackButton.hide();
    }
}

// Создание карточки тарифного плана
function createPlanCard(plan) {
    const card = document.createElement('div');
    card.className = 'plan-card';
    card.id = `plan-${plan.id}`;

    card.innerHTML = `
        <h3>${plan.name}</h3>
        <p class="price">${plan.price} ₽</p>
        <p class="description">${plan.description}</p>
        <button class="buy-btn" data-plan-id="${plan.id}" data-plan-name="${plan.name}" data-price="${plan.price}">
            Оформить
        </button>
    `;

    // Добавляем обработчик нажатия на кнопку "Оформить"
    const buyBtn = card.querySelector('.buy-btn');
    buyBtn.addEventListener('click', () => handlePlanSelection(plan));

    return card;
}

// Обработка выбора тарифного плана
async function handlePlanSelection(plan) {
    console.log(`Выбран план "${plan.name}" за ${plan.price} ₽`);
    
    // Показываем индикатор загрузки
    showLoader();
    
    // Блокируем кнопки покупки на время обработки
    setButtonsState(false);
    
    try {
        // Отправляем запрос на создание платежа
        const paymentData = await createPayment(plan.price, plan.name, CONFIG.userId);
        console.log('Данные платежа:', paymentData);
        
        if (!paymentData || paymentData.error) {
            throw new Error(paymentData?.error || 'Не удалось создать платеж');
        }
        
        // Сохраняем ID заказа для отслеживания
        currentOrderId = paymentData.orderId;
        
        // Инициализируем платежный виджет с полученным токеном
        await initPaymentWidget(
            paymentData.confirmationToken, 
            paymentData.testMode, 
            paymentData.orderId
        );
        
        // Показываем кнопку Назад при открытии платежной формы
        if (tg.BackButton) {
            tg.BackButton.show();
        }
    } catch (error) {
        console.error('Ошибка при создании платежа:', error);
        showError(`Не удалось создать платеж: ${error.message}`);
    } finally {
        // Скрываем индикатор загрузки
        hideLoader();
        
        // Разблокируем кнопки покупки
        setButtonsState(true);
    }
}

// Функция для создания платежа на сервере
async function createPayment(amount, planName, userId) {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/api/create-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount.toString(),
                planName: planName,
                userId: userId,
                description: `Подписка "${planName}"`
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Ошибка при создании платежа:', error);
        throw error;
    }
}

// Остановка всех проверок статуса платежа
function stopPaymentChecks() {
    if (window.statusCheckInterval) {
        clearInterval(window.statusCheckInterval);
        window.statusCheckInterval = null;
    }
    paymentCheckActive = false;
}

// Инициализация платежного виджета ЮKassa
async function initPaymentWidget(token, isTestMode, orderId) {
    console.log(`Инициализация платежного виджета. Тестовый режим: ${isTestMode}`);
    
    // Очищаем контейнер для виджета
    const paymentContainer = document.getElementById('paymentFormContainer');
    paymentContainer.innerHTML = '';
    
    // Показываем контейнер с формой оплаты
    const paymentModal = document.getElementById('paymentModal');
    paymentModal.classList.remove('hidden');
    
    // Добавляем кнопку закрытия модального окна
    const closePaymentBtn = document.getElementById('closePayment');
    closePaymentBtn.addEventListener('click', () => {
        paymentModal.classList.add('hidden');
        
        // Останавливаем любые запущенные проверки статуса
        stopPaymentChecks();
        
        // Скрываем кнопку Назад
        if (tg.BackButton) {
            tg.BackButton.hide();
        }
    });
    
    if (isTestMode) {
        // Создаем тестовую форму оплаты
        const testForm = document.createElement('div');
        testForm.className = 'test-payment-form';
        testForm.innerHTML = `
            <h3>Тестовый режим оплаты</h3>
            <p class="test-mode-note">Используйте следующие данные для теста:</p>
            
            <div class="card-form">
                <div class="form-group">
                    <label>Номер карты</label>
                    <input type="text" value="4111 1111 1111 1111" readonly class="card-number" />
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>Месяц/Год</label>
                        <input type="text" value="12/30" readonly class="card-date" />
                    </div>
                    <div class="form-group">
                        <label>CVC</label>
                        <input type="text" value="123" readonly class="card-cvc" />
                    </div>
                </div>
            </div>
            
            <button id="testPayButton" class="pay-button">Оплатить</button>
        `;
        
        paymentContainer.appendChild(testForm);
        
        // Обработчик для тестовой оплаты
        document.getElementById('testPayButton').addEventListener('click', async () => {
            try {
                // Имитируем процесс оплаты
                showLoader();
                document.getElementById('testPayButton').disabled = true;
                
                // Отображаем анимацию загрузки для имитации процесса
                setTimeout(async () => {
                    try {
                        // Вызываем тестовый маршрут для имитации успешной оплаты
                        const result = await fetch(`${CONFIG.apiUrl}/api/test-payment`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ orderId })
                        }).then(res => res.json());
                        
                        console.log('Результат тестовой оплаты:', result);
                        
                        if (result.status === 'succeeded') {
                            // Закрываем форму оплаты
                            paymentModal.classList.add('hidden');
                            
                            // Показываем модальное окно успешной оплаты
                            handleSuccessfulPayment(orderId);
                        } else {
                            throw new Error('Ошибка платежа');
                        }
                    } catch (error) {
                        console.error('Ошибка при тестовой оплате:', error);
                        hideLoader();
                        document.getElementById('testPayButton').disabled = false;
                        showError('Не удалось выполнить тестовую оплату');
                    }
                }, 1500); // Задержка для имитации процесса оплаты
            } catch (error) {
                console.error('Ошибка при тестовой оплате:', error);
                hideLoader();
                document.getElementById('testPayButton').disabled = false;
                showError('Не удалось выполнить тестовую оплату');
            }
        });
    } else {
        try {
            // Проверяем наличие библиотеки YooKassa
            if (typeof YooMoneyCheckoutWidget !== 'function') {
                throw new Error('Библиотека YooKassa не загружена');
            }
            
            // Инициализация виджета YooKassa
            const yooKassaWidget = new YooMoneyCheckoutWidget({
                confirmation_token: token,
                return_url: window.location.href + '?orderId=' + orderId + '&success=true',
                embedded_3ds: true,
                error_callback: function(error) {
                    console.error('Ошибка YooKassa виджета:', error);
                    showError(`Ошибка платежного виджета: ${error.message || 'Неизвестная ошибка'}`);
                },
                // Добавляем обработчик успешной оплаты
                success_callback: function(data) {
                    console.log('Успешная оплата YooKassa:', data);
                    handleSuccessfulPayment(orderId);
                }
            });
            
            // Отрисовка виджета
            yooKassaWidget.render('paymentFormContainer')
                .then(() => {
                    console.log('Виджет YooKassa успешно отрисован');
                    
                    // Добавляем обработчики для iframe, чтобы отслеживать изменения в форме
                    const iframes = document.querySelectorAll('#paymentFormContainer iframe');
                    iframes.forEach(iframe => {
                        // Добавляем класс для стилизации при необходимости
                        iframe.classList.add('yookassa-iframe');
                        
                        // Пытаемся отследить события внутри iframe
                        try {
                            iframe.contentWindow.addEventListener('message', event => {
                                console.log('Сообщение из iframe:', event.data);
                            });
                        } catch (err) {
                            console.log('Не удалось добавить обработчик к iframe (ожидаемо из-за Same-Origin Policy)');
                        }
                        
                        // Отслеживаем изменения в iframe для определения оплаты
                        try {
                            // Попытка отловить навигацию внутри iframe
                            iframe.addEventListener('load', () => {
                                console.log('Iframe загрузил новое содержимое, проверяем статус платежа');
                                // Проверяем платеж дополнительно при каждой перезагрузке iframe
                                forceCheckPaymentStatus(orderId);
                            });
                        } catch (err) {
                            console.log('Не удалось добавить обработчик load к iframe');
                        }
                    });
                    
                    // Запускаем периодическую проверку статуса платежа
                    checkPaymentStatus(orderId);
                    
                    // Дополнительно устанавливаем таймеры проверки платежа
                    setupAdditionalPaymentChecks(orderId);
                })
                .catch(err => {
                    console.error('Ошибка при отрисовке виджета YooKassa:', err);
                    showError(`Не удалось отобразить форму оплаты: ${err.message || 'Неизвестная ошибка'}`);
                    
                    // Если не удалось отрисовать виджет, показываем тестовую форму
                    fallbackToTestMode(token, orderId);
                });
        } catch (error) {
            console.error('Ошибка инициализации виджета YooKassa:', error);
            showError(`Ошибка инициализации платежного виджета: ${error.message}`);
            
            // Если есть ошибка с виджетом, показываем тестовую форму
            fallbackToTestMode(token, orderId);
        }
    }
}

// Функция для перехода в тестовый режим при проблемах с виджетом YooKassa
function fallbackToTestMode(token, orderId) {
    console.log('Переход в тестовый режим из-за проблем с виджетом YooKassa');
    initPaymentWidget(token, true, orderId);
}

// Функция для проверки статуса платежа
function checkPaymentStatus(orderId) {
    console.log(`Начинаем проверку статуса платежа ${orderId}`);
    
    // Проверяем, не активна ли уже проверка статуса
    if (paymentCheckActive) {
        console.log('Проверка статуса уже активна, пропускаем');
        return;
    }
    
    paymentCheckActive = true;
    
    // Очищаем предыдущую проверку, если она существует
    stopPaymentChecks();
    
    // Интервал для проверки статуса каждые 2 секунды
    window.statusCheckInterval = setInterval(async () => {
        try {
            // Проверяем, открыто ли еще модальное окно
            const paymentModal = document.getElementById('paymentModal');
            if (paymentModal && paymentModal.classList.contains('hidden')) {
                console.log('Модальное окно платежа закрыто, останавливаем проверку статуса');
                stopPaymentChecks();
                return;
            }
            
            // Запрашиваем статус платежа с сервера
            const response = await fetch(`${CONFIG.apiUrl}/api/payment-status/${orderId}`);
            
            if (!response.ok) {
                console.error('Ошибка при запросе статуса платежа:', response.status);
                return;
            }
            
            const statusData = await response.json();
            
            console.log(`Статус платежа ${orderId}:`, statusData);
            
            // Если платеж успешно завершен
            if (statusData.status === 'succeeded') {
                // Останавливаем проверку статуса
                stopPaymentChecks();
                
                // Обрабатываем успешный платеж
                handleSuccessfulPayment(orderId);
            }
            
            // Если платеж отменен или произошла ошибка
            if (statusData.status === 'canceled') {
                // Останавливаем проверку статуса
                stopPaymentChecks();
                
                // Показываем сообщение об ошибке
                showError('Платеж был отменен');
            }
        } catch (error) {
            console.error('Ошибка при проверке статуса платежа:', error);
        }
    }, 2000);
    
    // Останавливаем проверку через 3 минуты (180000 мс) для избежания бесконечной проверки
    setTimeout(() => {
        if (paymentCheckActive) {
            stopPaymentChecks();
            console.log(`Проверка статуса платежа ${orderId} остановлена по таймауту`);
            
            // Если прошло 3 минуты, и мы не получили статус, показываем модальное окно с вопросом
            const paymentModal = document.getElementById('paymentModal');
            if (paymentModal && !paymentModal.classList.contains('hidden')) {
                if (confirm('Не удалось получить подтверждение платежа. Если вы уже оплатили, нажмите OK, чтобы подтвердить оплату.')) {
                    handleSuccessfulPayment(orderId);
                }
            }
        }
    }, 180000);
}

// Установка дополнительных проверок статуса платежа
function setupAdditionalPaymentChecks(orderId) {
    // Проверка после определенных интервалов, когда пользователь может уже оплатить
    const checkPoints = [
        15000, // через 15 секунд
        30000, // через 30 секунд
        60000  // через 60 секунд
    ];
    
    checkPoints.forEach(delay => {
        setTimeout(() => {
            // Проверяем, что модальное окно всё ещё открыто и платеж не обработан
            const paymentModal = document.getElementById('paymentModal');
            const successModal = document.getElementById('successModal');
            
            if (paymentModal && 
                !paymentModal.classList.contains('hidden') && 
                successModal && 
                successModal.classList.contains('hidden')) {
                console.log(`Проверка статуса платежа ${orderId} по таймеру ${delay}ms`);
                forceCheckPaymentStatus(orderId);
            }
        }, delay);
    });
    
    // Следим за действиями пользователя для определения возможного возврата из платежной формы
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            console.log('Страница стала видимой - возможно, пользователь вернулся из платежной формы');
            const paymentModal = document.getElementById('paymentModal');
            if (paymentModal && !paymentModal.classList.contains('hidden')) {
                forceCheckPaymentStatus(orderId);
            }
        }
    });
}

// Принудительная проверка статуса платежа
async function forceCheckPaymentStatus(orderId) {
    try {
        console.log(`Принудительная проверка статуса платежа: ${orderId}`);
        
        // Запрашиваем статус платежа с сервера
        const response = await fetch(`${CONFIG.apiUrl}/api/payment-status/${orderId}`);
        
        if (!response.ok) {
            console.error('Ошибка при запросе статуса платежа:', response.status);
            return;
        }
        
        const statusData = await response.json();
        
        console.log(`Получен статус платежа ${orderId}:`, statusData);
        
        // Если платеж успешно завершен
        if (statusData.status === 'succeeded') {
            console.log('Обнаружен успешный платеж при принудительной проверке');
            handleSuccessfulPayment(orderId);
            return true;
        }
    } catch (error) {
        console.error('Ошибка при принудительной проверке статуса платежа:', error);
    }
    
    return false;
}

// Показать модальное окно успешной оплаты
function showSuccessModal() {
    const successModal = document.getElementById('successModal');
    if (successModal) {
        successModal.classList.remove('hidden');
    }
}

// Показать сообщение об ошибке
function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        
        // Скрываем сообщение через 5 секунд
        setTimeout(() => {
            errorElement.classList.add('hidden');
        }, 5000);
    } else {
        alert(message);
    }
}

// Показать индикатор загрузки
function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.remove('hidden');
    }
}

// Скрыть индикатор загрузки
function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('hidden');
    }
}

// Включить/отключить кнопки покупки
function setButtonsState(enabled) {
    const buttons = document.querySelectorAll('.buy-btn');
    buttons.forEach(button => {
        button.disabled = !enabled;
    });
}

// Вспомогательная функция для получения параметров из URL
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
} 