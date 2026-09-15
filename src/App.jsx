import { useEffect, useState } from "react";

import {
  saveSurvey,
  getSurveys,
  updateSurvey,
  deleteSurvey,
} from "./db";

import {
  syncPendingSurveys,
} from "./sync";

import {
  deleteSurveyFromServer,
} from "./api";


function App() {
  const [building, setBuilding] = useState("");
  const [room, setRoom] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("good");
  const [note, setNote] = useState("");

  const [location, setLocation] = useState(null);
  const [photo, setPhoto] = useState(null);

  const [isOnline, setIsOnline] = useState(
    navigator.onLine
  );

  const [surveys, setSurveys] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);


  // =====================================================
  // ĐỌC DANH SÁCH PHIẾU TỪ INDEXEDDB
  // =====================================================

  const loadSurveys = async () => {
    try {
      const data = await getSurveys();

      // Không hiển thị những phiếu đã đánh dấu xóa
      const visibleSurveys = data.filter(
        (survey) => survey.syncStatus !== "deleted"
      );

      setSurveys(visibleSurveys);
    } catch (error) {
      console.error(
        "Không thể đọc dữ liệu IndexedDB:",
        error
      );
    }
  };


  // =====================================================
  // ĐỒNG BỘ DỮ LIỆU
  // =====================================================

  const handleSync = async () => {
    if (!navigator.onLine) {
      alert("📴 Hiện tại không có Internet");
      return;
    }

    if (isSyncing) {
      return;
    }

    setIsSyncing(true);

    try {
      await syncPendingSurveys();

      await loadSurveys();

      console.log(
        "✅ Đã hoàn thành đồng bộ dữ liệu"
      );
    } catch (error) {
      console.error(
        "❌ Lỗi đồng bộ:",
        error
      );
    } finally {
      setIsSyncing(false);
    }
  };


  // =====================================================
  // LẤY VỊ TRÍ GPS
  // =====================================================

  const getLocation = () => {
    if (!navigator.geolocation) {
      alert("Thiết bị không hỗ trợ GPS");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        console.error(
          "Lỗi GPS:",
          error
        );

        alert(
          "Không thể lấy vị trí. Hãy cấp quyền GPS cho trình duyệt."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };


  // =====================================================
  // CHỌN / CHỤP ẢNH
  // =====================================================

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn một file ảnh.");
      e.target.value = "";
      return;
    }

    // Giới hạn file gốc 5 MB
    if (file.size > 5 * 1024 * 1024) {
      alert(
        "Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 5 MB."
      );
      e.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const originalDataUrl = reader.result;

      if (typeof originalDataUrl !== "string") {
        alert("Không thể đọc dữ liệu ảnh.");
        return;
      }

      // Nén ảnh trước khi lưu IndexedDB / gửi Apps Script.
      // Điều này giúp giảm kích thước Base64 và tránh request quá lớn.
      const image = new Image();

      image.onload = () => {
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 1600;

        let width = image.naturalWidth;
        let height = image.naturalHeight;

        const scale = Math.min(
          1,
          MAX_WIDTH / width,
          MAX_HEIGHT / height
        );

        width = Math.round(width * scale);
        height = Math.round(height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          // Nếu trình duyệt không tạo được canvas thì dùng ảnh gốc.
          setPhoto(originalDataUrl);
          return;
        }

        ctx.drawImage(
          image,
          0,
          0,
          width,
          height
        );

        // JPEG giúp Base64 nhỏ hơn đáng kể so với ảnh gốc.
        const compressedDataUrl =
          canvas.toDataURL("image/jpeg", 0.75);

        console.log("📷 Đã xử lý ảnh:", {
          name: file.name,
          originalSize: file.size,
          originalDataLength: originalDataUrl.length,
          compressedDataLength: compressedDataUrl.length,
          width,
          height,
        });

        setPhoto(compressedDataUrl);
      };

      image.onerror = () => {
        console.error("❌ Không thể xử lý ảnh");
        alert("Không thể xử lý ảnh.");
      };

      image.src = originalDataUrl;
    };

    reader.onerror = () => {
      console.error("❌ Không thể đọc file ảnh");
      alert("Không thể đọc file ảnh.");
    };

    reader.readAsDataURL(file);
  };


  // =====================================================
  // LƯU PHIẾU
  // =====================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!building || !room) {
      alert(
        "Vui lòng chọn tòa nhà và nhập số phòng."
      );

      return;
    }

    console.log("📸 Ảnh trước khi tạo survey:", {
      exists: !!photo,
      length: typeof photo === "string" ? photo.length : 0,
      preview: typeof photo === "string"
        ? photo.substring(0, 40)
        : "",
    });

    const survey = {
      id: crypto.randomUUID(),

      building: building,

      room: room,

      status: selectedStatus,

      note: note,

      latitude: location?.latitude || "",

      longitude: location?.longitude || "",

      accuracy: location?.accuracy || "",

      createdAt: new Date().toISOString(),

      photoData: typeof photo === "string" ? photo : "",

      photoURL: "",

      syncStatus: "pending",
    };

    try {
      // Luôn lưu local trước
      await saveSurvey(survey);

      console.log(
        "💾 Đã lưu IndexedDB:",
        JSON.parse(JSON.stringify({
          ...survey,
          photoData: survey.photoData
            ? `[BASE64 ${survey.photoData.length} ký tự]`
            : "",
        }))
      );

      await loadSurveys();

      // Nếu có mạng thì đồng bộ ngay
      if (navigator.onLine) {
        const savedSurveys = await getSurveys();
        const savedSurvey = savedSurveys.find(
          (item) => item.id === survey.id
        );

        console.log("📤 Survey chuẩn bị đồng bộ:", {
          id: savedSurvey?.id,
          photoDataLength:
            typeof savedSurvey?.photoData === "string"
              ? savedSurvey.photoData.length
              : 0,
          hasPhoto:
            typeof savedSurvey?.photoData === "string" &&
            savedSurvey.photoData.length > 0,
        });

        await handleSync();
      }

      // Reset form
      setBuilding("");
      setRoom("");
      setSelectedStatus("good");
      setNote("");
      setLocation(null);
      setPhoto(null);

      // Reset input file bằng cách reload form state
      const fileInput =
        document.getElementById("photo-input");

      if (fileInput) {
        fileInput.value = "";
      }

      alert(
        navigator.onLine
          ? "✅ Đã lưu và đồng bộ dữ liệu!"
          : "📴 Đã lưu offline. Khi có mạng, dữ liệu sẽ tự động đồng bộ."
      );
    } catch (error) {
      console.error(
        "Lỗi lưu phiếu:",
        error
      );

      alert(
        "❌ Không thể lưu phiếu: " +
          error.message
      );
    }
  };


  // =====================================================
  // XÓA PHIẾU
  // =====================================================

  const handleDeleteSurvey = async (id) => {
    const confirmed = window.confirm(
      "Bạn có chắc chắn muốn xóa phiếu này không?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const localSurveys = await getSurveys();

      const survey = localSurveys.find(
        (item) => item.id === id
      );

      if (!survey) {
        alert("Không tìm thấy phiếu cần xóa.");
        return;
      }

      if (navigator.onLine) {
        // Online: xóa trực tiếp trên Google Sheet
        await deleteSurveyFromServer(id);

        // Xóa khỏi IndexedDB
        await deleteSurvey(id);

        alert(
          "🗑️ Đã xóa phiếu trên App và Google Sheet."
        );
      } else {
        // Offline: đánh dấu deleted để lần online xóa trên server
        survey.syncStatus = "deleted";

        await updateSurvey(survey);

        alert(
          "📴 Đã đánh dấu xóa offline. Khi có mạng, phiếu sẽ được xóa trên Google Sheet."
        );
      }

      await loadSurveys();
    } catch (error) {
      console.error(
        "Lỗi xóa phiếu:",
        error
      );

      alert(
        "❌ Không thể xóa phiếu: " +
          error.message
      );
    }
  };


  // =====================================================
  // KHỞI TẠO VÀ THEO DÕI ONLINE/OFFLINE
  // =====================================================

  useEffect(() => {
    loadSurveys();

    const handleOnline = async () => {
      console.log(
        "🌐 Internet đã trở lại"
      );

      setIsOnline(true);

      // Tự động đồng bộ khi có mạng
      await handleSync();
    };

    const handleOffline = () => {
      console.log(
        "📴 Thiết bị đang offline"
      );

      setIsOnline(false);
    };

    window.addEventListener(
      "online",
      handleOnline
    );

    window.addEventListener(
      "offline",
      handleOffline
    );

    return () => {
      window.removeEventListener(
        "online",
        handleOnline
      );

      window.removeEventListener(
        "offline",
        handleOffline
      );
    };
  }, []);


  return (
    <div className="app">

      <header className="header">
        <h1>VKU Field Survey</h1>
        <span>
          Khảo sát cơ sở vật chất
        </span>
      </header>


      <main className="container">

        {/* Trạng thái mạng */}
        <div className="status">
          {isOnline
            ? "🟢 Đang online"
            : "🔴 Đang offline"}
        </div>


        {/* Trạng thái đồng bộ */}
        <div className="sync-status">
          {isSyncing ? (
            <p>
              🔄 Đang đồng bộ dữ liệu...
            </p>
          ) : (
            <p>
              📋 Tổng số phiếu: {surveys.length}
            </p>
          )}
        </div>


        {/* Nút đồng bộ thủ công */}
        <button
          type="button"
          onClick={handleSync}
          disabled={!isOnline || isSyncing}
        >
          {isSyncing
            ? "🔄 Đang đồng bộ..."
            : "🔄 Đồng bộ ngay"}
        </button>


        {/* FORM KHẢO SÁT */}
        <form onSubmit={handleSubmit}>

          <label>
            Tòa nhà
          </label>

          <select
            value={building}
            onChange={(e) =>
              setBuilding(e.target.value)
            }
            required
          >
            <option value="">
              -- Chọn tòa nhà --
            </option>

            <option value="A">
              Tòa A
            </option>

            <option value="B">
              Tòa B
            </option>

            <option value="C">
              Tòa C
            </option>
          </select>


          <label>
            Phòng
          </label>

          <input
            type="text"
            placeholder="Ví dụ: A203"
            value={room}
            onChange={(e) =>
              setRoom(e.target.value)
            }
            required
          />


          <label>
            Tình trạng
          </label>

          <div className="radio-group">

            <label>
              <input
                type="radio"
                name="status"
                value="good"
                checked={
                  selectedStatus === "good"
                }
                onChange={(e) =>
                  setSelectedStatus(
                    e.target.value
                  )
                }
              />

              🟢 Tốt
            </label>


            <label>
              <input
                type="radio"
                name="status"
                value="repair"
                checked={
                  selectedStatus === "repair"
                }
                onChange={(e) =>
                  setSelectedStatus(
                    e.target.value
                  )
                }
              />

              🟡 Cần sửa
            </label>


            <label>
              <input
                type="radio"
                name="status"
                value="broken"
                checked={
                  selectedStatus === "broken"
                }
                onChange={(e) =>
                  setSelectedStatus(
                    e.target.value
                  )
                }
              />

              🔴 Hư hỏng
            </label>

          </div>


          <label>
            Ghi chú
          </label>

          <textarea
            placeholder="Nhập mô tả tình trạng..."
            value={note}
            onChange={(e) =>
              setNote(e.target.value)
            }
          />


          {/* GPS */}
          <button
            type="button"
            onClick={getLocation}
          >
            📍 Lấy vị trí hiện tại
          </button>


          {location && (
            <div className="location-box">

              <strong>
                📍 Đã lấy vị trí
              </strong>

              <p>
                Latitude: {location.latitude}
              </p>

              <p>
                Longitude: {location.longitude}
              </p>

              <p>
                Accuracy: {location.accuracy} m
              </p>

            </div>
          )}


          {/* ẢNH */}
          <label>
            Ảnh khảo sát
          </label>

          <input
            id="photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
          />


          {/* Preview ảnh */}
          {photo && (
            <div className="photo-preview">

              <p>
                📷 Ảnh đã chọn và sẽ được lưu offline:
              </p>

              <img
                src={photo}
                alt="Ảnh khảo sát"
                style={{
                  width: "100%",
                  maxWidth: "400px",
                  borderRadius: "12px",
                  marginTop: "10px",
                }}
              />

            </div>
          )}


          <button type="submit">
            💾 Lưu phiếu khảo sát
          </button>

        </form>


        {/* DANH SÁCH PHIẾU */}
        <section className="survey-list">

          <h2>
            📋 Phiếu đã lưu
          </h2>


          {surveys.length === 0 ? (

            <p>
              Chưa có phiếu khảo sát.
            </p>

          ) : (

            surveys.map((survey) => (

              <div
                className="survey-card"
                key={survey.id}
              >

                <strong>
                  {survey.building} - {survey.room}
                </strong>


                <p>
                  🏷️ Tình trạng:{" "}
                  {survey.status}
                </p>


                <p>
                  📝{" "}
                  {survey.note ||
                    "Không có ghi chú"}
                </p>


                <p>
                  📍{" "}
                  {survey.latitude
                    ? `${survey.latitude}, ${survey.longitude}`
                    : "Chưa có vị trí"}
                </p>


                <p>
                  {survey.syncStatus === "synced"
                    ? "🟢 Đã đồng bộ"
                    : "🟠 Chờ đồng bộ"}
                </p>


                {/* Ảnh đã đồng bộ */}
                {survey.photoURL && (
                  <div className="saved-photo">

                    <p>
                      📷 Ảnh:
                    </p>

                    <img
                      src={survey.photoURL}
                      alt="Ảnh khảo sát đã lưu"
                      style={{
                        width: "200px",
                        maxWidth: "100%",
                        borderRadius: "10px",
                      }}
                    />

                  </div>
                )}


                {/* Ảnh chưa đồng bộ nhưng đã lưu local */}
                {!survey.photoURL &&
                  survey.photoData && (
                    <div className="local-photo">

                      <p>
                        📷 Ảnh đang chờ đồng bộ:
                      </p>

                      <img
                        src={survey.photoData}
                        alt="Ảnh đang chờ đồng bộ"
                        style={{
                          width: "200px",
                          maxWidth: "100%",
                          borderRadius: "10px",
                        }}
                      />

                    </div>
                  )}


                {/* Nút xóa */}
                <button
                  type="button"
                  onClick={() =>
                    handleDeleteSurvey(
                      survey.id
                    )
                  }
                >
                  🗑️ Xóa phiếu
                </button>

              </div>

            ))

          )}

        </section>

      </main>

    </div>
  );
}


export default App;