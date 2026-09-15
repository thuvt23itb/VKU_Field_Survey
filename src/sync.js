import {
    getPendingSurveys,
    getSurveys,
    updateSurvey,
    deleteSurvey,
} from "./db";

import {
    sendSurvey,
    fetchSurveys,
    deleteSurveyFromServer,
} from "./api";


// =====================================================
// ĐỒNG BỘ DỮ LIỆU 2 CHIỀU
// =====================================================

export async function syncPendingSurveys() {

    if (!navigator.onLine) {

        console.log(
            "📴 Offline - không đồng bộ"
        );

        return;
    }


    console.log(
        "================================="
    );

    console.log(
        "🔄 BẮT ĐẦU ĐỒNG BỘ"
    );

    console.log(
        "================================="
    );


    // ===================================================
    // 1. LẤY TOÀN BỘ LOCAL
    // ===================================================

    let localSurveys =
        await getSurveys();


    console.log(
        `📱 Local: ${localSurveys.length} phiếu`
    );


    // ===================================================
    // 2. LẤY CÁC PHIẾU CẦN ĐỒNG BỘ
    // ===================================================

    const pending =
        await getPendingSurveys();


    console.log(
        `📤 Có ${pending.length} phiếu cần đồng bộ`
    );


    // ===================================================
    // 3. PUSH LOCAL → GOOGLE SHEET
    // ===================================================

    for (
        const survey of pending
    ) {

        try {

            // -----------------------------------------------
            // PHIẾU ĐÃ BỊ XÓA LOCAL
            // -----------------------------------------------

            if (
                survey.syncStatus ===
                "deleted"
            ) {

                console.log(
                    `🗑️ Đang xóa ${survey.id} trên Google Sheet...`
                );


                const result =
                    await deleteSurveyFromServer(
                        survey.id
                    );


                if (
                    result &&
                    result.success
                ) {

                    await deleteSurvey(
                        survey.id
                    );


                    console.log(
                        `✅ Đã xóa ${survey.id} trên Google Sheet`
                    );

                }

                continue;
            }


            // -----------------------------------------------
            // PHIẾU PENDING
            // -----------------------------------------------

            console.log(
                `📤 Đang upload ${survey.id}...`
            );


            const photoDataLength = survey.photoData
                ? survey.photoData.length
                : 0;

            console.log("📦 Dữ liệu chuẩn bị gửi:", {
                id: survey.id,
                hasPhotoData: !!survey.photoData,
                photoDataLength: photoDataLength,
                photoURL: survey.photoURL || "",
            });

            const result = await sendSurvey(survey);

            console.log("📥 Kết quả từ server:", {
                success: result?.success,
                action: result?.action,
                photoURL: result?.photoURL || "",
            });

            if (result && result.success) {

                // ============================================
                // CÓ ẢNH
                // ============================================

                if (survey.photoData) {

                    // Server phải trả về photoURL
                    if (!result.photoURL) {

                        console.error(
                            "❌ SERVER NHẬN SURVEY NHƯNG KHÔNG TRẢ VỀ photoURL"
                        );

                        console.error(
                            "❌ Giữ lại photoData để không mất ảnh"
                        );

                        // KHÔNG đánh dấu synced
                        survey.syncStatus = "pending";

                        await updateSurvey(survey);

                        continue;
                    }

                    // Server upload ảnh thành công
                    survey.photoURL = result.photoURL;

                    survey.photoData = "";

                    console.log(
                        "🖼️ Upload ảnh thành công:",
                        result.photoURL
                    );

                } else {

                    // ============================================
                    // KHÔNG CÓ ẢNH
                    // ============================================

                    survey.photoData = "";

                    console.log(
                        "ℹ️ Survey không có ảnh"
                    );
                }

                // ============================================
                // ĐÁNH DẤU ĐÃ ĐỒNG BỘ
                // ============================================

                survey.syncStatus = "synced";

                survey.syncedAt =
                    new Date().toISOString();

                await updateSurvey(survey);

                console.log(
                    `✅ Đồng bộ thành công: ${survey.id}`
                );
            }


        } catch (error) {

            console.error(
                `❌ Đồng bộ thất bại: ${survey.id}`,
                error
            );

        }
    }


    // ===================================================
    // 4. GET DỮ LIỆU TỪ GOOGLE SHEET
    // ===================================================

    try {

        console.log(
            "📥 Đang lấy dữ liệu từ Google Sheet..."
        );


        const remote =
            await fetchSurveys();


        if (
            !remote ||
            !remote.success
        ) {

            throw new Error(
                remote?.message ||
                "Google Sheet trả về dữ liệu không hợp lệ"
            );
        }


        const remoteSurveys =
            Array.isArray(
                remote.surveys
            )
                ? remote.surveys
                : [];


        const deletedIds =
            Array.isArray(
                remote.deletedIds
            )
                ? remote.deletedIds
                : [];


        console.log(
            `☁️ Google Sheet: ${remoteSurveys.length} phiếu`
        );


        console.log(
            `🗑️ Server deleted: ${deletedIds.length} ID`
        );


        // =================================================
        // 5. LẤY LOCAL MỚI NHẤT
        // =================================================

        localSurveys =
            await getSurveys();


        // =================================================
        // 6. XÓA LOCAL THEO DELETED SURVEYS
        // =================================================

        for (
            const deletedId of deletedIds
        ) {

            const local =
                localSurveys.find(
                    item =>
                        String(item.id) ===
                        String(deletedId)
                );


            if (local) {

                // Nếu local chưa có thay đổi mới
                // thì xóa luôn

                if (
                    local.syncStatus !==
                    "pending"
                ) {

                    await deleteSurvey(
                        deletedId
                    );


                    console.log(
                        `🗑️ Xóa local theo server: ${deletedId}`
                    );
                }
            }
        }


        // =================================================
        // 7. MERGE GOOGLE SHEET → LOCAL
        // =================================================

        for (
            const remoteSurvey
            of remoteSurveys
        ) {

            // -----------------------------------------------
            // Bỏ qua dữ liệu không có ID
            // -----------------------------------------------

            if (
                !remoteSurvey.id
            ) {

                continue;
            }


            // Lấy local mới nhất
            localSurveys =
                await getSurveys();


            const local =
                localSurveys.find(
                    item =>
                        String(item.id) ===
                        String(remoteSurvey.id)
                );


            // -----------------------------------------------
            // Không tồn tại local
            // → tải từ Google Sheet xuống
            // -----------------------------------------------

            if (!local) {

                await updateSurvey({

                    ...remoteSurvey,

                    syncStatus:
                        "synced",

                    photoData:
                        ""

                });


                console.log(
                    `⬇️ Tải phiếu từ Sheet: ${remoteSurvey.id}`
                );


                continue;
            }


            // -----------------------------------------------
            // LOCAL ĐANG PENDING
            // -----------------------------------------------

            if (
                local.syncStatus ===
                "pending"
            ) {

                console.log(
                    `⏭️ Bỏ qua ${remoteSurvey.id} vì local đang pending`
                );

                continue;
            }


            // -----------------------------------------------
            // LOCAL ĐANG DELETED
            // -----------------------------------------------

            if (
                local.syncStatus ===
                "deleted"
            ) {

                console.log(
                    `⏭️ Bỏ qua ${remoteSurvey.id} vì local đang deleted`
                );

                continue;
            }


            // -----------------------------------------------
            // LOCAL ĐÃ SYNCED
            // → cập nhật theo Google Sheet
            // -----------------------------------------------

            await updateSurvey({

                ...remoteSurvey,

                syncStatus:
                    "synced",

                photoData:
                    ""

            });


            console.log(
                `🔄 Cập nhật local: ${remoteSurvey.id}`
            );
        }


        // =================================================
        // 8. LẤY LOCAL LẠI SAU KHI MERGE
        // =================================================

        const finalLocal =
            await getSurveys();


        console.log(
            `📱 Local sau sync: ${finalLocal.length} phiếu`
        );


        console.log(
            "================================="
        );

        console.log(
            "🎉 ĐỒNG BỘ 2 CHIỀU HOÀN TẤT"
        );

        console.log(
            "================================="
        );


    } catch (error) {

        console.error(
            "❌ Lỗi khi đồng bộ Google Sheet:",
            error
        );

        throw error;
    }
}