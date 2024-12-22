from flask import Flask, render_template, request, send_file
import qrcode
import os
from datetime import datetime

app = Flask(__name__)

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        data = request.form.get('data')
        if data:
            qr = qrcode.QRCode(version=1, box_size=10, border=5)
            qr.add_data(data)
            qr.make(fit=True)
            img = qr.make_image(fill='black', back_color='white')

            # Simpan dengan timestamp untuk nama unik
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            filename = f"qr_{timestamp}.png"
            img_path = os.path.join('static/qr_codes', filename)

            # Pastikan folder ada
            if not os.path.exists('static/qr_codes'):
                os.makedirs('static/qr_codes')

            img.save(img_path)

            # Print untuk debugging
            print(f"Gambar disimpan di: {img_path}")

            return render_template('index.html', qr_code=filename)

    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)
