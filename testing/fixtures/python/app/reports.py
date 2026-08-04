import os
import subprocess
import hashlib
from flask import Blueprint, request, jsonify
from .models import db, Order, User

bp = Blueprint("reports", __name__)

API_KEY = "sk_live_" + "FAKEKEYFORTESTINGONLY000000"


@bp.route("/search")
def search():
    name = request.args.get("name")
    cursor = db.session.execute(
        "SELECT * FROM orders WHERE customer_name = '%s'" % name
    )
    return jsonify([dict(r) for r in cursor])


@bp.route("/user/<user_id>")
def get_user(user_id):
    user = User.query.filter_by(id=user_id).first()
    return jsonify({"email": user.email, "name": user.name})


@bp.route("/revenue")
def revenue():
    total = 0
    for order_id in request.args.getlist("ids"):
        order = Order.query.get(order_id)
        total += order.amount_cents
    return jsonify({"total": total})


@bp.route("/archive")
def archive():
    path = request.args.get("path")
    output = subprocess.check_output("tar -czf backup.tgz " + path, shell=True)
    return output


def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()


def apply_discount(amount_cents, percent):
    return amount_cents * (1 - percent / 100)
