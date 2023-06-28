import { nanoid } from "nanoid";

class NotificationManager {
    constructor(sqs) {
        this.sqs = sqs;
        this.notifications = [];
    }

    addNotification(notification) {
        this.notifications.push(notification);
    }

    getNotifications() {
        return this.notifications;
    }

    removeNotification(notificationId) {

        //fade out notification and delete on completion
        $("#"+notificationId).animate({
            opacity: 0
        }, 200, () => {
            $("#"+notificationId).remove();
        });
        
        this.notifications = this.notifications.filter((notification) => {
            return notification !== notificationId;
        });
    }

    notify(text, status = "info", timeout = 10000) {
        //clone and import fragment of notification
        const notificationFragment = document.importNode(document.querySelector('#notification-box').content, true);

        let notificationId = nanoid();
        notificationFragment.querySelector(".notification").setAttribute("id", notificationId);
        $(".notification-text", notificationFragment).text(text);
        

        $(".dismiss-btn", notificationFragment).on("click", () => {
            this.removeNotification(notificationId);
        });

        //if there are other notifications, animate them down
        if (this.notifications.length > 0) {
            $(".notification").each((index, notification) => {
                $(notification).animate({
                    top: "+=5em"
                }, 200);
            });
        }

        //set background color and icon according to status
        switch (status) {
            case "info":
                $(".notification-icon", notificationFragment).html("<i class=\"fa fa-info-circle\" aria-hidden=\"true\"></i>");
                $(".notification-type-box", notificationFragment).addClass("notification-level-info");
                break;
            case "warning":
                $(".notification-icon", notificationFragment).html("<i class=\"fa fa-exclamation-circle\" aria-hidden=\"true\"></i>");
                $(".notification-type-box", notificationFragment).addClass("notification-level-warning");
                break;
            case "error":
                $(".notification-icon", notificationFragment).html("<i class=\"fa fa-exclamation-triangle\" aria-hidden=\"true\"></i>");
                $(".notification-type-box", notificationFragment).addClass("notification-level-error");
                break;
        }


        document.body.appendChild(notificationFragment);
        this.addNotification(notificationId);

        setTimeout(() => {
            this.removeNotification(notificationId);
        }, timeout);
    }
}

export { NotificationManager as default }